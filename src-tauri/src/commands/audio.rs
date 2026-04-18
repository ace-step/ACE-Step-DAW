//! Tauri IPC commands that drive the native audio engine.
//!
//! The engine itself lives in a `Mutex<Engine>` managed by Tauri state.
//! Every command locks that mutex, performs the operation, and releases —
//! the audio callback runs on its own CPAL-owned thread and is not
//! affected by the mutex.

use std::sync::Mutex;
use tauri::{Emitter, State};

use crate::engine::{
    audio_io, AudioDeviceInfo, ClipSchedule, ClipSource, CommandError, CountIn, Engine,
    EngineConfig, EngineError, EngineStatus, LoopRegion, MetronomeConfig, PositionEmitter,
    PunchRegion, TempoEvent, TempoMap, TimeSignatureEvent, TimeSignatureMap, TrackParams,
    POSITION_EVENT_DEFAULT_INTERVAL,
};
use crate::engine::slot::SlotHandle;

/// State wrapper around the engine. Tauri requires `Send + Sync`, and
/// `Engine` itself is `!Sync` because it holds a channel sender; the
/// mutex gives us both, and the audio thread lives entirely inside the
/// engine so the lock is never held across an audio callback.
pub struct EngineState(pub Mutex<Engine>);

impl EngineState {
    pub fn new() -> Self {
        Self(Mutex::new(Engine::new()))
    }
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}

/// Holds the background thread that emits transport-position Tauri
/// events at ~60 Hz while the engine is running. Split from
/// [`EngineState`] so the existing 20+ command sites that lock
/// `state.0` don't need to change shape.
///
/// The `None` case means "no emitter currently active" — i.e. the
/// engine is stopped, or the app is still in first-open state.
pub struct TransportEmitterState(pub Mutex<Option<PositionEmitter>>);

impl TransportEmitterState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for TransportEmitterState {
    fn default() -> Self {
        Self::new()
    }
}

/// Tauri event name for the 60 Hz transport-position push. Payload
/// is a `u64` sample position. Kept as a constant so the UI test
/// harness can reference it without hard-coding the string.
pub const TRANSPORT_POSITION_EVENT: &str = "transport-position";

// ── Device enumeration ──────────────────────────────────────────────

#[tauri::command]
pub fn audio_list_devices() -> Vec<AudioDeviceInfo> {
    audio_io::list_output_devices()
}

#[tauri::command]
pub fn audio_get_default_device() -> Option<AudioDeviceInfo> {
    audio_io::get_default_output_device_info()
}

// ── Engine lifecycle ────────────────────────────────────────────────

// Locking protocol for start/stop (addresses codex P1 on PR #1715):
//
// - ALWAYS take `EngineState` FIRST, then `TransportEmitterState`.
//   The reverse order in any command would risk a deadlock if two
//   commands overlap.
// - HOLD BOTH LOCKS through the entire emitter lifecycle transition
//   (old stopped → new stopped, or old running → new running).
//   Otherwise a `stop_engine` that sees `None` can race a concurrent
//   `start_engine` that installs a new emitter between the check and
//   the engine stop, leaving a stale emitter behind.

#[tauri::command]
pub fn audio_start_engine(
    config: EngineConfig,
    state: State<'_, EngineState>,
    emitter_state: State<'_, TransportEmitterState>,
    app: tauri::AppHandle,
) -> Result<EngineStatus, EngineError> {
    // Take locks in canonical order and hold both.
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    let mut emitter_slot = emitter_state
        .0
        .lock()
        .map_err(|_| EngineError::Open("emitter mutex poisoned".into()))?;

    // Stop any leftover emitter BEFORE starting the new engine — so
    // we never have two emitters pushing to the same event name, and
    // we don't leak a thread if `start` fails.
    if let Some(mut old) = emitter_slot.take() {
        old.stop();
    }

    let status = engine.start(config)?;

    if let Some(shared_pos) = engine.shared_position_handle() {
        let app_handle = app.clone();
        let emitter = PositionEmitter::start(
            shared_pos,
            POSITION_EVENT_DEFAULT_INTERVAL,
            move |pos| {
                // Deliberately ignore emit errors: the webview may
                // not be alive on initial boot, and a dropped event
                // is preferable to panicking the emitter thread.
                let _ = app_handle.emit(TRANSPORT_POSITION_EVENT, pos);
            },
        );
        *emitter_slot = Some(emitter);
    }

    Ok(status)
}

#[tauri::command]
pub fn audio_stop_engine(
    state: State<'_, EngineState>,
    emitter_state: State<'_, TransportEmitterState>,
) -> Result<(), EngineError> {
    // Canonical order: engine first, emitter second — matches
    // start_engine so the two commands can never deadlock each
    // other.
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    let mut emitter_slot = emitter_state
        .0
        .lock()
        .map_err(|_| EngineError::Open("emitter mutex poisoned".into()))?;

    // Stop the emitter BEFORE the engine so it doesn't tick one
    // more event carrying a stale (pre-rewind) position after
    // `engine.stop()` resets the counter.
    if let Some(mut e) = emitter_slot.take() {
        e.stop();
    }
    engine.stop();
    Ok(())
}

#[tauri::command]
pub fn audio_get_engine_status(
    state: State<'_, EngineState>,
) -> Result<EngineStatus, EngineError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    Ok(engine.status())
}

// ── Track management (2B-1d) ────────────────────────────────────────

#[tauri::command]
pub fn audio_add_track(
    params: TrackParams,
    state: State<'_, EngineState>,
) -> Result<SlotHandle, CommandError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.add_track(params)
}

#[tauri::command]
pub fn audio_remove_track(
    handle: SlotHandle,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.remove_track(handle)
}

#[tauri::command]
pub fn audio_set_track_params(
    handle: SlotHandle,
    params: TrackParams,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_track_params(handle, params)
}

#[tauri::command]
pub fn audio_set_master_volume(
    volume: f32,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_master_volume(volume)
}

// ── Transport (3A) ──────────────────────────────────────────────────

#[tauri::command]
pub fn audio_transport_play(state: State<'_, EngineState>) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_play()
}

#[tauri::command]
pub fn audio_transport_stop(state: State<'_, EngineState>) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_stop()
}

#[tauri::command]
pub fn audio_transport_pause(state: State<'_, EngineState>) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_pause()
}

#[tauri::command]
pub fn audio_transport_seek(
    sample_position: u64,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_seek(sample_position)
}

#[tauri::command]
pub fn audio_transport_set_tempo(
    bpm: f32,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_set_tempo(bpm)
}

/// Read the current transport position in samples. Safe to call at
/// UI frame rate — reads an atomic counter, no command round-trip.
/// Returns 0 when the engine is stopped.
#[tauri::command]
pub fn audio_transport_get_position(state: State<'_, EngineState>) -> Result<u64, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.transport_position())
}

// ── Transport tempo / time-signature maps (3B) ──────────────────────

/// Replace the full tempo map atomically. Returns `InvalidTempoMap`
/// if the events fail validation (empty, unsorted, duplicated, or
/// missing the sample-0 anchor).
#[tauri::command]
pub fn audio_transport_set_tempo_map(
    events: Vec<TempoEvent>,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_tempo_map(events)
}

/// Snapshot the current tempo map. Returns `None` when the engine is
/// stopped. Safe to call at UI frame rate — `ArcSwap::load_full` is
/// wait-free and produces a cheap reference-counted handle.
#[tauri::command]
pub fn audio_transport_get_tempo_map(
    state: State<'_, EngineState>,
) -> Result<Option<TempoMap>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    // Load the snapshot Arc<TempoMap>, then deep-clone for the
    // wire. The clone is O(n) in event count — tolerable because
    // the map is bounded to MAX_TEMPO_EVENTS (1024) and this
    // command is expected to be polled rarely (tempo map loads on
    // project open, not at UI frame rate). If this becomes a hot
    // path, switch to a dedicated "tempo map changed" Tauri event
    // that pushes on swap instead of a pull-poll.
    // Copilot review follow-up (PR #1711).
    Ok(engine.tempo_map_snapshot().map(|arc| (*arc).clone()))
}

#[tauri::command]
pub fn audio_transport_set_time_signature_map(
    events: Vec<TimeSignatureEvent>,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_time_signature_map(events)
}

#[tauri::command]
pub fn audio_transport_get_time_signature_map(
    state: State<'_, EngineState>,
) -> Result<Option<TimeSignatureMap>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine
        .time_signature_map_snapshot()
        .map(|arc| (*arc).clone()))
}

/// Convert a fractional beat count to a sample position using the
/// current tempo map + active sample rate. Returns 0 when stopped.
#[tauri::command]
pub fn audio_transport_beat_to_sample(
    beat: f64,
    state: State<'_, EngineState>,
) -> Result<u64, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.beat_to_sample(beat))
}

/// Convert an absolute sample position to a fractional beat count.
/// Returns 0 when stopped.
#[tauri::command]
pub fn audio_transport_sample_to_beat(
    sample: u64,
    state: State<'_, EngineState>,
) -> Result<f64, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.sample_to_beat(sample))
}

// ── Transport loop region (3C) ──────────────────────────────────────

/// Replace the transport loop region atomically. Malformed ranges
/// (`end <= start`) are accepted but silently treated as disabled
/// on the audio thread — this supports transient UI drag states
/// where the handles briefly cross.
#[tauri::command]
pub fn audio_transport_set_loop_region(
    region: LoopRegion,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_loop_region(region)
}

/// Snapshot the current loop region. Returns `None` when the
/// engine is stopped.
#[tauri::command]
pub fn audio_transport_get_loop_region(
    state: State<'_, EngineState>,
) -> Result<Option<LoopRegion>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.loop_region_snapshot())
}

/// Toggle just the `enabled` flag of the current loop region
/// without changing its bounds. Convenience for the "Loop On/Off"
/// UI control.
#[tauri::command]
pub fn audio_transport_set_loop_enabled(
    enabled: bool,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_loop_enabled(enabled)
}

// ── Metronome (3E) ──────────────────────────────────────────────────

#[tauri::command]
pub fn audio_metronome_set_config(
    config: MetronomeConfig,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_metronome_config(config)
}

#[tauri::command]
pub fn audio_metronome_get_config(
    state: State<'_, EngineState>,
) -> Result<Option<MetronomeConfig>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.metronome_config_snapshot())
}

#[tauri::command]
pub fn audio_metronome_set_enabled(
    enabled: bool,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_metronome_enabled(enabled)
}

// ── Clip scheduler (3F) ─────────────────────────────────────────────

/// Replace the full clip schedule atomically. Validated on the
/// Rust side via `ClipSchedule::try_new` before publishing, so a
/// malformed payload (too many clips, empty audio_data, length
/// exceeding PCM frames) returns a typed error to the UI instead
/// of reaching the audio thread.
#[tauri::command]
pub fn audio_clip_set_schedule(
    clips: Vec<ClipSource>,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_clip_schedule(clips)
}

// ── Transport scrub (3G) ────────────────────────────────────────────

#[tauri::command]
pub fn audio_transport_scrub(
    delta_samples: i64,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.transport_scrub(delta_samples)
}

// ── Punch region (3G) ──────────────────────────────────────────────

#[tauri::command]
pub fn audio_transport_set_punch_region(
    region: PunchRegion,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_punch_region(region)
}

#[tauri::command]
pub fn audio_transport_get_punch_region(
    state: State<'_, EngineState>,
) -> Result<Option<PunchRegion>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.punch_region_snapshot())
}

#[tauri::command]
pub fn audio_transport_set_punch_enabled(
    enabled: bool,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_punch_enabled(enabled)
}

// ── Count-in (3G) ──────────────────────────────────────────────────

#[tauri::command]
pub fn audio_transport_set_count_in(
    config: CountIn,
    state: State<'_, EngineState>,
) -> Result<(), CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    engine.set_count_in(config)
}

#[tauri::command]
pub fn audio_transport_get_count_in(
    state: State<'_, EngineState>,
) -> Result<Option<CountIn>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    Ok(engine.count_in_snapshot())
}

// ── Clip scheduler (3F) - continued ────────────────────────────────

/// Snapshot the current clip schedule. Returns `None` when the
/// engine is stopped. Each clip's audio_data is serialized as a
/// Vec<f32> on the wire — this can be large for long clips, so
/// the UI should poll `get_schedule` rarely (on project load /
/// structural change), not per-frame.
///
/// Returns `InvalidClipSchedule` on the rare path where the
/// snapshot round-trips through `try_new` and hits an invariant
/// error — prefer surfacing that over silently pretending the
/// schedule was cleared (Copilot review on PR #1719).
#[tauri::command]
pub fn audio_clip_get_schedule(
    state: State<'_, EngineState>,
) -> Result<Option<ClipSchedule>, CommandError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| CommandError::Disconnected)?;
    let Some(arc) = engine.clip_schedule_snapshot() else {
        return Ok(None);
    };
    // Rebuild an owned ClipSchedule for the wire. The clip
    // audio_data is still shared Arc<Vec<f32>> so there is no
    // deep copy of the PCM.
    let rebuilt = ClipSchedule::try_new(arc.clips().to_vec())
        .map_err(|e| CommandError::InvalidClipSchedule(e.to_string()))?;
    Ok(Some(rebuilt))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The state wrapper is `Send + Sync` — Tauri's `State<T>` requires it.
    #[test]
    fn engine_state_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<EngineState>();
    }

    #[test]
    fn engine_state_starts_stopped() {
        let state = EngineState::new();
        let engine = state.0.lock().unwrap();
        assert_eq!(engine.status(), EngineStatus::Stopped);
    }
}
