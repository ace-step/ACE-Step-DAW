//! Tauri IPC commands that drive the native audio engine.
//!
//! The engine itself lives in a `Mutex<Engine>` managed by Tauri state.
//! Every command locks that mutex, performs the operation, and releases —
//! the audio callback runs on its own CPAL-owned thread and is not
//! affected by the mutex.

use std::sync::Mutex;
use tauri::State;

use crate::engine::{
    audio_io, AudioDeviceInfo, CommandError, Engine, EngineConfig, EngineError,
    EngineStatus, TrackParams,
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

#[tauri::command]
pub fn audio_start_engine(
    config: EngineConfig,
    state: State<'_, EngineState>,
) -> Result<EngineStatus, EngineError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    engine.start(config)
}

#[tauri::command]
pub fn audio_stop_engine(state: State<'_, EngineState>) -> Result<(), EngineError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
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
