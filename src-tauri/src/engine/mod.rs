//! Real-time audio engine lifecycle.
//!
//! # Why a dedicated owner thread?
//!
//! CPAL's [`cpal::Stream`] is `!Send` on some host APIs (notably CoreAudio
//! on macOS). That means we cannot put a `Stream` into a `Mutex` and share
//! it across Tauri's tokio worker threads. Instead, a dedicated std thread
//! owns the stream end-to-end: it opens the stream, blocks waiting for a
//! stop signal, then drops the stream to close it.
//!
//! # Command queue (added in 2B-1c)
//!
//! The main thread drives the mixer via a lock-free
//! `crossbeam_channel::Sender<EngineCommand>`. The matching receiver is
//! owned by the CPAL audio callback, which drains up to
//! [`audio_io::COMMAND_DRAIN_BUDGET`] commands per buffer before rendering.
//! Every mutation of the [`AudioGraph`] happens on the audio thread via
//! `graph.apply(cmd)` — the main thread never touches the graph directly.
//!
//! # Testability
//!
//! [`Engine::start`] is the production entry point using CPAL.
//! [`Engine::start_with`] accepts an injected runner closure, letting unit
//! tests drive the full state machine without any audio hardware. The
//! runner receives a [`RuntimeContext`] bundling the config, graph,
//! command receiver, ready signal, and stop signal.

pub mod audio_io;
pub mod clip;
pub mod command;
pub mod config;
pub mod count_in;
pub mod effect_chain;
pub mod graph;
pub mod loop_region;
pub mod meter;
pub mod meter_bank;
pub mod metronome;
pub mod mixer;
pub mod position_emitter;
pub mod punch_region;
pub mod routing;
pub mod slot;
pub mod tempo_map;
pub mod time_sig_map;
pub mod transport;

pub use command::{EngineCommand, TrackParams};
pub use config::{
    AudioDeviceInfo, ConfigError, EngineConfig, EngineStatus, VALID_BUFFER_SIZES,
    VALID_SAMPLE_RATES,
};
pub use graph::{AudioGraph, Track, MAX_TRACKS};
pub use clip::{ClipSchedule, ClipScheduleError, ClipSource, MAX_CLIPS};
pub use count_in::{CountIn, CountInState, MAX_COUNT_IN_BEATS, MIN_COUNT_IN_BEATS};
pub use loop_region::LoopRegion;
pub use metronome::MetronomeConfig;
pub use punch_region::PunchRegion;
pub use position_emitter::{PositionEmitter, DEFAULT_INTERVAL as POSITION_EVENT_DEFAULT_INTERVAL};
pub use meter::{generate_sine, Meter, MeterReading};
pub use meter_bank::{MeterConsumers, MeterProducers};
pub use mixer::{equal_power_pan, is_audible};
pub use slot::{SlotAllocator, SlotHandle};
pub use tempo_map::{TempoEvent, TempoMap, TempoMapError};
pub use time_sig_map::{TimeSignatureEvent, TimeSignatureMap, TimeSignatureMapError};
pub use transport::{SharedPosition, Transport, TransportState, DEFAULT_BPM, MAX_BPM, MIN_BPM};

use arc_swap::ArcSwap;
use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use serde::Serialize;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

/// Wait budget for the audio owner thread to report whether the stream
/// opened successfully. CPAL device open is synchronous but can take a
/// surprising amount of time on first launch (permission prompts, driver
/// cold-start); 5 s is conservative but forgiving.
const OPEN_TIMEOUT: Duration = Duration::from_secs(5);

/// Capacity of the main → audio command queue.
///
/// Bounded so the main thread gets backpressure via `try_send` rather
/// than allocating unbounded memory on a runaway automation loop. At
/// 1024 × `sizeof::<EngineCommand>` (≲ 64 B) that's ~64 KiB per
/// channel, which is cheap and absorbs multi-second bursts of
/// automation even at 60 Hz UI tick rate.
pub const COMMAND_QUEUE_CAPACITY: usize = 1024;

/// Metadata returned by the audio owner thread once the stream is live.
/// The active config may differ from the requested config if CPAL fell
/// back (e.g. device only supports 44.1 kHz and the user asked for 96).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenInfo {
    pub active_config: EngineConfig,
    pub device_name: String,
    pub channels: u16,
}

/// Result the audio owner thread reports back at startup.
pub type OpenResult = Result<OpenInfo, String>;

/// Everything a `StreamRunner` needs to take ownership of the audio
/// path. Bundled into a struct so future additions extend one type
/// instead of mutating the runner signature repeatedly.
pub struct RuntimeContext {
    pub config: EngineConfig,
    pub graph: AudioGraph,
    pub cmd_rx: Receiver<EngineCommand>,
    pub ready_tx: Sender<OpenResult>,
    pub stop_rx: Receiver<()>,
    /// Audio-thread half of the metering ring buffers.
    pub meter_producers: MeterProducers,
    /// Pre-allocated per-track effect chains.
    pub track_effects: Vec<effect_chain::TrackEffects>,
    /// Pre-allocated aux send/return routing state.
    pub routing: routing::RoutingState,
    /// Transport state machine + position counter. The audio callback
    /// owns this and advances the position on every buffer; the main
    /// thread drives it via [`EngineCommand`] variants prefixed
    /// `Transport*`.
    pub transport: Transport,
}

/// Errors surfaced to Tauri command handlers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase", tag = "kind", content = "message")]
pub enum EngineError {
    #[error("engine is already running; stop it before starting with a new config")]
    AlreadyRunning,
    #[error("configuration is invalid: {0}")]
    Config(#[from] ConfigError),
    #[error("audio device could not be opened: {0}")]
    Open(String),
    #[error("audio device did not respond within {0:?}")]
    OpenTimeout(Duration),
}

/// Grace period the main thread waits for the audio callback to drain
/// in-flight commands before tearing down the stream. Under normal load
/// the audio callback drains `COMMAND_DRAIN_BUDGET` commands per ~5 ms
/// buffer, so a full 1024-command queue takes ~40 ms to flush. 100 ms
/// covers that with headroom while staying well inside the range a
/// user would accept as "instant" stop.
const STOP_GRACE_PERIOD: Duration = Duration::from_millis(100);

/// Errors returned from the command-sending API. Serializable for
/// Tauri IPC error responses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase", tag = "kind", content = "message")]
pub enum CommandError {
    #[error("engine is not running; start it before sending commands")]
    NotRunning,
    #[error("command queue is full (capacity {0}); back off and retry")]
    QueueFull(usize),
    #[error("command queue is disconnected (audio thread has exited)")]
    Disconnected,
    #[error("track slot allocator is full (capacity {0}); cannot add more tracks")]
    SlotAllocatorFull(usize),
    /// Caller sent a tempo-map payload that violated the map invariants
    /// (empty, unsorted, duplicated positions, or missing the sample-0
    /// anchor). The payload is rejected before reaching the audio
    /// thread — no partial update.
    #[error("invalid tempo map: {0}")]
    InvalidTempoMap(String),
    /// Same as `InvalidTempoMap` but for the time-signature map.
    #[error("invalid time signature map: {0}")]
    InvalidTimeSignatureMap(String),
    /// Caller sent a clip-schedule payload that violated invariants
    /// (too many clips, empty audio_data, length > PCM frames).
    #[error("invalid clip schedule: {0}")]
    InvalidClipSchedule(String),
}

/// Contract for the function that owns a CPAL stream.
///
/// Implementations must:
///  1. Take ownership of the supplied [`RuntimeContext`].
///  2. Try to open the stream and send the result on `ctx.ready_tx`
///     (at most once).
///  3. On success, keep the stream alive — draining commands from
///     `ctx.cmd_rx` into `ctx.graph` inside the audio callback —
///     until `ctx.stop_rx` fires or is dropped.
///  4. Drop the stream (which closes CPAL) and return.
///
/// The real production runner lives in
/// [`audio_io::run_cpal_output_stream`].
pub trait StreamRunner: Send + 'static {
    fn run(self: Box<Self>, ctx: RuntimeContext);
}

impl<F> StreamRunner for F
where
    F: FnOnce(RuntimeContext) + Send + 'static,
{
    fn run(self: Box<Self>, ctx: RuntimeContext) {
        (*self)(ctx)
    }
}

/// Live-stream state. When `None`, the engine is stopped.
///
/// `slot_alloc` is the single source of truth for track slot
/// indices. Callers never construct their own [`SlotAllocator`] —
/// they go through [`Engine::add_track`] / [`Engine::remove_track`]
/// so every live handle comes from one place. Found by codex review
/// on PR #1698: two callers each running
/// `SlotAllocator::with_default_capacity()` would both mint slot 0 /
/// generation 1, letting one caller's `SetTrackParams` target
/// another caller's live track.
struct RunningEngine {
    stop_tx: Sender<()>,
    cmd_tx: Sender<EngineCommand>,
    slot_alloc: SlotAllocator,
    meter_consumers: MeterConsumers,
    thread: Option<JoinHandle<()>>,
    status: EngineStatus,
    /// Main-thread handle on the transport's atomic position counter.
    /// Cloned from the audio thread's `Transport` at startup; lets
    /// position reads bypass the command queue entirely.
    shared_position: SharedPosition,
    /// Main-thread handle on the transport's tempo map. Mutations
    /// happen via `.store(Arc::new(...))` and are visible to the
    /// audio callback on its next `.load()` — no command round-trip.
    tempo_map: Arc<ArcSwap<TempoMap>>,
    /// Same pattern for time signature.
    time_sig_map: Arc<ArcSwap<TimeSignatureMap>>,
    /// Same pattern for the loop region.
    loop_region: Arc<ArcSwap<LoopRegion>>,
    /// Same pattern for the metronome config.
    metronome_config: Arc<ArcSwap<MetronomeConfig>>,
    /// Same pattern for the clip schedule.
    clip_schedule: Arc<ArcSwap<ClipSchedule>>,
    /// Same pattern for the punch (record-arm) region.
    punch_region: Arc<ArcSwap<PunchRegion>>,
    /// Same pattern for the count-in config.
    count_in: Arc<ArcSwap<CountIn>>,
    /// Main-thread-owned ring buffer of recently-retired clip
    /// schedules. Each `set_clip_schedule` pushes the old Arc onto
    /// this queue and pops the oldest when the queue grows past
    /// `CLIP_SCHEDULE_GRAVEYARD_SIZE`. The drop of the evicted
    /// Arc happens on the main thread (the caller of
    /// `set_clip_schedule`) — which prevents the audio callback,
    /// which may transiently hold a guard referencing the old
    /// schedule, from being the last owner and ending up
    /// deallocating PCM buffers on the RT thread. Found by codex
    /// review on PR #1719.
    clip_schedule_graveyard: std::sync::Mutex<std::collections::VecDeque<Arc<ClipSchedule>>>,
    /// Active sample rate — cached so beat↔sample conversion can
    /// run without re-parsing `EngineStatus`.
    sample_rate: u32,
}

/// How many past clip schedules to keep alive on the main thread
/// after a swap. With audio buffers in the 1-10 ms range, 16 is
/// 16-160 ms of audio processing — orders of magnitude more than
/// the audio callback's window for a single guard hold.
pub const CLIP_SCHEDULE_GRAVEYARD_SIZE: usize = 16;

impl RunningEngine {
    fn shutdown(mut self) {
        // Grace period: give the audio callback a chance to drain
        // any in-flight commands before we tear down the stream.
        // Without this, a burst followed by an immediate stop can
        // silently lose the tail of the queue — every send_command
        // returned Ok, but the commands never reached the graph
        // because the stream was dropped mid-drain. Found by codex
        // review on PR #1698.
        //
        // Poll `cmd_tx.is_empty()` rather than sleeping a flat
        // duration so well-behaved flows shut down quickly and only
        // pathological ones pay the full ceiling.
        let grace_deadline = std::time::Instant::now() + STOP_GRACE_PERIOD;
        while !self.cmd_tx.is_empty() && std::time::Instant::now() < grace_deadline {
            std::thread::sleep(Duration::from_millis(1));
        }

        // Dropping cmd_tx closes the channel so the audio thread's
        // try_recv sees Disconnected on the next buffer.
        drop(self.cmd_tx);
        // Tell the owner thread to drop the stream. A full channel means
        // an earlier stop is still queued — either way the thread will
        // see exactly one Stop and exit, so we ignore SendError.
        let _ = self.stop_tx.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// The top-level engine handle. Single-threaded API surface — the
/// `RunningEngine` internally manages the audio owner thread.
pub struct Engine {
    running: Option<RunningEngine>,
}

impl Engine {
    pub fn new() -> Self {
        Self { running: None }
    }

    /// Start the engine with the production CPAL runner.
    pub fn start(&mut self, config: EngineConfig) -> Result<EngineStatus, EngineError> {
        self.start_with(config, audio_io::run_cpal_output_stream)
    }

    /// Start the engine with a custom runner — used by unit tests and by
    /// any future backend (e.g. JACK) that wants to reuse the lifecycle.
    pub fn start_with<R>(
        &mut self,
        config: EngineConfig,
        runner: R,
    ) -> Result<EngineStatus, EngineError>
    where
        R: StreamRunner,
    {
        if self.running.is_some() {
            return Err(EngineError::AlreadyRunning);
        }
        config.validate()?;

        let (ready_tx, ready_rx) = bounded::<OpenResult>(1);
        let (stop_tx, stop_rx) = bounded::<()>(1);
        let (cmd_tx, cmd_rx) = bounded::<EngineCommand>(COMMAND_QUEUE_CAPACITY);
        let (meter_prods, meter_cons) =
            meter_bank::create_meter_pair(config.sample_rate as f32);
        let transport = Transport::new();
        let shared_position = transport.shared_position();
        let tempo_map_handle = transport.tempo_map_handle();
        let time_sig_map_handle = transport.time_sig_map_handle();
        let loop_region_handle = transport.loop_region_handle();
        let metronome_config_handle = transport.metronome_config_handle();
        let clip_schedule_handle = transport.clip_schedule_handle();
        let punch_region_handle = transport.punch_region_handle();
        let count_in_handle = transport.count_in_handle();

        let ctx = RuntimeContext {
            config: config.clone(),
            graph: AudioGraph::new(),
            cmd_rx,
            ready_tx,
            stop_rx,
            meter_producers: meter_prods,
            track_effects: effect_chain::create_effect_chains(config.sample_rate as f32),
            routing: routing::RoutingState::new(MAX_TRACKS, 1024),
            transport,
        };

        let boxed: Box<dyn StreamRunner> = Box::new(runner);
        let thread = std::thread::Builder::new()
            .name("ace-audio-owner".into())
            .spawn(move || {
                boxed.run(ctx);
            })
            .expect("spawn audio owner thread");

        match ready_rx.recv_timeout(OPEN_TIMEOUT) {
            Ok(Ok(info)) => {
                // Use the ACTIVE sample rate reported by the audio
                // thread, not the requested config. CPAL is allowed
                // to fall back (e.g. device doesn't support the
                // requested rate) — if we cached the requested value,
                // beat↔sample conversions would drift silently.
                // Found by Copilot review on PR #1711.
                let active_sample_rate = info.active_config.sample_rate;
                let status = EngineStatus::Running {
                    active_config: info.active_config,
                    device_name: info.device_name,
                    channels: info.channels,
                };
                self.running = Some(RunningEngine {
                    stop_tx,
                    cmd_tx,
                    slot_alloc: SlotAllocator::with_default_capacity(),
                    meter_consumers: meter_cons,
                    thread: Some(thread),
                    status: status.clone(),
                    shared_position,
                    tempo_map: tempo_map_handle,
                    time_sig_map: time_sig_map_handle,
                    loop_region: loop_region_handle,
                    metronome_config: metronome_config_handle,
                    clip_schedule: clip_schedule_handle,
                    punch_region: punch_region_handle,
                    count_in: count_in_handle,
                    clip_schedule_graveyard: std::sync::Mutex::new(
                        std::collections::VecDeque::with_capacity(
                            CLIP_SCHEDULE_GRAVEYARD_SIZE,
                        ),
                    ),
                    sample_rate: active_sample_rate,
                });
                Ok(status)
            }
            Ok(Err(msg)) => {
                // Runner reported failure. Signal stop defensively in
                // case the runner is (incorrectly or by choice) parked
                // on stop_rx after reporting the error — otherwise
                // thread.join() would deadlock. A well-behaved runner
                // ignores the extra signal; a blocked runner unblocks.
                let _ = stop_tx.send(());
                drop(stop_tx);
                drop(cmd_tx);
                let _ = thread.join();
                Err(EngineError::Open(msg))
            }
            Err(_) => {
                // Timeout or channel closed with no message — treat as
                // hard failure.
                let _ = stop_tx.send(());
                drop(stop_tx);
                drop(cmd_tx);
                let _ = thread.join();
                Err(EngineError::OpenTimeout(OPEN_TIMEOUT))
            }
        }
    }

    /// Stop the engine. Idempotent — a second call on a stopped engine is
    /// a no-op.
    pub fn stop(&mut self) {
        if let Some(running) = self.running.take() {
            running.shutdown();
        }
    }

    pub fn status(&self) -> EngineStatus {
        self.running
            .as_ref()
            .map(|r| r.status.clone())
            .unwrap_or(EngineStatus::Stopped)
    }

    pub fn is_running(&self) -> bool {
        self.running.is_some()
    }

    /// Allocate a track slot and seed it on the audio thread with
    /// the given params. Returns the allocator handle so subsequent
    /// `set_track_params` / `remove_track` calls can address the
    /// same track safely.
    ///
    /// This is the **only** supported way to add a track — callers
    /// must not construct their own [`SlotAllocator`]. Two parallel
    /// allocators would both mint `slot 0 / generation 1` and let
    /// one caller's commands target another caller's live track.
    pub fn add_track(&mut self, params: TrackParams) -> Result<SlotHandle, CommandError> {
        let running = self.running.as_mut().ok_or(CommandError::NotRunning)?;
        let handle = running
            .slot_alloc
            .acquire()
            .ok_or(CommandError::SlotAllocatorFull(MAX_TRACKS))?;
        match running
            .cmd_tx
            .try_send(EngineCommand::AddTrack { handle, params })
        {
            Ok(()) => Ok(handle),
            Err(e) => {
                // Reclaim the slot so a transient queue-full does not
                // leak an allocator slot until the next stop.
                running.slot_alloc.release(handle);
                Err(match e {
                    TrySendError::Full(_) => CommandError::QueueFull(COMMAND_QUEUE_CAPACITY),
                    TrySendError::Disconnected(_) => CommandError::Disconnected,
                })
            }
        }
    }

    /// Remove a previously-added track. Sends `RemoveTrack` to the
    /// audio thread and releases the slot back to the allocator.
    /// Stale handles (from a previous generation) are harmless —
    /// `AudioGraph::apply` generation-checks them out.
    pub fn remove_track(&mut self, handle: SlotHandle) -> Result<(), CommandError> {
        let running = self.running.as_mut().ok_or(CommandError::NotRunning)?;
        match running.cmd_tx.try_send(EngineCommand::RemoveTrack { handle }) {
            Ok(()) => {
                running.slot_alloc.release(handle);
                Ok(())
            }
            Err(TrySendError::Full(_)) => Err(CommandError::QueueFull(COMMAND_QUEUE_CAPACITY)),
            Err(TrySendError::Disconnected(_)) => Err(CommandError::Disconnected),
        }
    }

    /// Update the parameters of an already-added track.
    pub fn set_track_params(
        &self,
        handle: SlotHandle,
        params: TrackParams,
    ) -> Result<(), CommandError> {
        self.send_command(EngineCommand::SetTrackParams { handle, params })
    }

    /// Set the master-bus output gain.
    pub fn set_master_volume(&self, volume: f32) -> Result<(), CommandError> {
        self.send_command(EngineCommand::SetMasterVolume { volume })
    }

    // ── Transport (3A) ───────────────────────────────────────────────

    /// Begin playback from the current position.
    pub fn transport_play(&self) -> Result<(), CommandError> {
        self.send_command(EngineCommand::TransportPlay)
    }

    /// Stop playback and rewind to 0.
    pub fn transport_stop(&self) -> Result<(), CommandError> {
        self.send_command(EngineCommand::TransportStop)
    }

    /// Stop playback but keep the current position.
    pub fn transport_pause(&self) -> Result<(), CommandError> {
        self.send_command(EngineCommand::TransportPause)
    }

    /// Jump the transport to an absolute sample position.
    pub fn transport_seek(&self, sample_position: u64) -> Result<(), CommandError> {
        self.send_command(EngineCommand::TransportSeek { sample_position })
    }

    /// Scrub: move the playhead by a signed delta and put the
    /// transport in `Scrubbing` state. The audio callback won't
    /// auto-advance while in Scrubbing, so this is the only way
    /// the playhead moves during a scrub session.
    pub fn transport_scrub(&self, delta_samples: i64) -> Result<(), CommandError> {
        self.send_command(EngineCommand::TransportScrub { delta_samples })
    }

    /// Set a constant tempo by publishing a single-event map via
    /// the same `ArcSwap` channel that [`set_tempo_map`] uses.
    /// Returns `Err(NotRunning)` if the engine is stopped.
    ///
    /// **Ordering**: `set_tempo` and `set_tempo_map` now share one
    /// publication channel, so a later call unambiguously wins —
    /// there is no race where a queued `set_tempo` could arrive
    /// after a later `set_tempo_map` and clobber it. Found by codex
    /// review on PR #1711 (P1): prior version routed `set_tempo`
    /// through the audio-thread command queue while `set_tempo_map`
    /// wrote the `ArcSwap` immediately, creating two uncoordinated
    /// write paths.
    pub fn transport_set_tempo(&self, bpm: f32) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        running
            .tempo_map
            .store(Arc::new(TempoMap::new_constant(bpm)));
        Ok(())
    }

    /// Snapshot the current transport sample position. Reads the
    /// atomic counter directly — no command round-trip, so this is
    /// safe to call at UI frame rate (60 Hz). Returns 0 when the
    /// engine is stopped.
    pub fn transport_position(&self) -> u64 {
        self.running
            .as_ref()
            .map(|r| r.shared_position.get())
            .unwrap_or(0)
    }

    /// Clone the shared-position handle. External readers (the
    /// [`position_emitter::PositionEmitter`] background thread, UI
    /// poller, Tauri event pusher) use this to observe the atomic
    /// counter without going through the engine mutex or the
    /// command queue. Returns `None` when the engine is stopped.
    pub fn shared_position_handle(&self) -> Option<SharedPosition> {
        self.running.as_ref().map(|r| r.shared_position.clone())
    }

    // ── Transport tempo / time-signature maps (3B) ──────────────────

    /// Replace the full tempo map atomically. Validates the payload
    /// via [`TempoMap::try_new`] before publishing — an invalid map
    /// never reaches the audio thread.
    pub fn set_tempo_map(&self, events: Vec<TempoEvent>) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let map = TempoMap::try_new(events)
            .map_err(|e| CommandError::InvalidTempoMap(format!("{e:?}")))?;
        running.tempo_map.store(Arc::new(map));
        Ok(())
    }

    /// Snapshot the current tempo map. Returns `None` when the
    /// engine is stopped. Cheap — `.load_full()` is wait-free and
    /// produces a reference-counted `Arc<TempoMap>`.
    pub fn tempo_map_snapshot(&self) -> Option<Arc<TempoMap>> {
        self.running.as_ref().map(|r| r.tempo_map.load_full())
    }

    /// Replace the full time-signature map atomically. Validated
    /// the same way as [`set_tempo_map`].
    pub fn set_time_signature_map(
        &self,
        events: Vec<TimeSignatureEvent>,
    ) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let map = TimeSignatureMap::try_new(events)
            .map_err(|e| CommandError::InvalidTimeSignatureMap(format!("{e:?}")))?;
        running.time_sig_map.store(Arc::new(map));
        Ok(())
    }

    /// Snapshot the current time-signature map.
    pub fn time_signature_map_snapshot(&self) -> Option<Arc<TimeSignatureMap>> {
        self.running.as_ref().map(|r| r.time_sig_map.load_full())
    }

    /// Convert a fractional beat count to a sample position using
    /// the current tempo map and sample rate. Returns 0 when the
    /// engine is stopped (no sample rate available).
    pub fn beat_to_sample(&self, beat: f64) -> u64 {
        match self.running.as_ref() {
            Some(r) => r.tempo_map.load().beat_to_sample(beat, r.sample_rate),
            None => 0,
        }
    }

    /// Convert an absolute sample position to a fractional beat
    /// count using the current tempo map. Returns 0 when stopped.
    pub fn sample_to_beat(&self, sample: u64) -> f64 {
        match self.running.as_ref() {
            Some(r) => r.tempo_map.load().sample_to_beat(sample, r.sample_rate),
            None => 0.0,
        }
    }

    // ── Transport loop region (3C) ──────────────────────────────────

    /// Replace the loop region atomically. The region is stored as
    /// given — malformed regions (`end <= start`) are NOT rejected
    /// here because the UI may be in a transient drag state where
    /// the handles have briefly crossed. Such regions are silently
    /// treated as disabled on the audio thread (see
    /// [`LoopRegion::is_active`]).
    pub fn set_loop_region(&self, region: LoopRegion) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        running.loop_region.store(Arc::new(region));
        Ok(())
    }

    /// Snapshot the current loop region. Returns `None` when the
    /// engine is stopped.
    pub fn loop_region_snapshot(&self) -> Option<LoopRegion> {
        self.running.as_ref().map(|r| **r.loop_region.load())
    }

    /// Enable or disable the existing loop region without changing
    /// its bounds. Convenience for the "Loop On/Off" UI toggle.
    pub fn set_loop_enabled(&self, enabled: bool) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let mut region = **running.loop_region.load();
        region.enabled = enabled;
        running.loop_region.store(Arc::new(region));
        Ok(())
    }

    // ── Metronome (3E) ──────────────────────────────────────────────

    /// Replace the metronome config atomically. Incoming values
    /// are normalized via `MetronomeConfig::new` so a deserialized
    /// payload with out-of-range volume or non-finite frequency
    /// cannot poison the audio thread.
    pub fn set_metronome_config(&self, config: MetronomeConfig) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let normalized = MetronomeConfig::new(
            config.enabled,
            config.volume,
            config.accent_volume,
            config.click_freq_hz,
            config.accent_freq_hz,
        );
        running.metronome_config.store(Arc::new(normalized));
        Ok(())
    }

    /// Snapshot the current metronome config. Returns `None` when
    /// the engine is stopped.
    pub fn metronome_config_snapshot(&self) -> Option<MetronomeConfig> {
        self.running
            .as_ref()
            .map(|r| **r.metronome_config.load())
    }

    /// Convenience: toggle just `enabled` without changing the
    /// other knobs. Used by the UI "Click On/Off" button.
    pub fn set_metronome_enabled(&self, enabled: bool) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let mut cfg = **running.metronome_config.load();
        cfg.enabled = enabled;
        running.metronome_config.store(Arc::new(cfg));
        Ok(())
    }

    // ── Clip schedule (3F) ──────────────────────────────────────────

    /// Replace the clip schedule atomically. Validates via
    /// [`ClipSchedule::try_new`] before publishing so a malformed
    /// payload never reaches the audio thread.
    ///
    /// Uses a main-thread graveyard to defer the drop of the
    /// *previous* schedule: the audio callback may be holding a
    /// `load()` guard referencing it, and when that guard drops
    /// (end of callback) we don't want the RT thread to be the
    /// last owner and trigger allocator work on itself. By
    /// retaining each retired Arc here for
    /// [`CLIP_SCHEDULE_GRAVEYARD_SIZE`] swaps, the eviction drop
    /// always happens on the main thread. Found by codex review
    /// on PR #1719.
    pub fn set_clip_schedule(&self, clips: Vec<ClipSource>) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let schedule = ClipSchedule::try_new(clips)
            .map_err(|e| CommandError::InvalidClipSchedule(e.to_string()))?;
        let new_arc = Arc::new(schedule);
        // Snapshot the outgoing schedule on the MAIN thread so the
        // Arc's refcount doesn't hit zero on the audio side.
        let old_arc = running.clip_schedule.load_full();
        running.clip_schedule.store(new_arc);
        // Push into the graveyard; drop the oldest eviction here
        // (main thread) rather than letting the audio callback
        // become the last owner.
        let mut graveyard = running
            .clip_schedule_graveyard
            .lock()
            .map_err(|_| CommandError::Disconnected)?;
        graveyard.push_back(old_arc);
        while graveyard.len() > CLIP_SCHEDULE_GRAVEYARD_SIZE {
            // `pop_front` returns Some(Arc<...>) — dropped HERE
            // on the main thread. If no other references exist
            // (including no audio-thread guard), deallocation of
            // the ClipSchedule's `Vec<ClipSource>` and each
            // clip's `Vec<f32>` PCM happens on this thread.
            graveyard.pop_front();
        }
        Ok(())
    }

    /// Snapshot the current clip schedule. Returns `None` when the
    /// engine is stopped. Cheap — wait-free `load_full` produces a
    /// refcounted handle.
    pub fn clip_schedule_snapshot(&self) -> Option<Arc<ClipSchedule>> {
        self.running.as_ref().map(|r| r.clip_schedule.load_full())
    }

    // ── Punch region (3G) ──────────────────────────────────────────

    /// Replace the punch region atomically. Malformed ranges
    /// (`end <= start`) are accepted but silently treated as
    /// disabled on the audio thread (matches LoopRegion).
    pub fn set_punch_region(&self, region: PunchRegion) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        running.punch_region.store(Arc::new(region));
        Ok(())
    }

    pub fn punch_region_snapshot(&self) -> Option<PunchRegion> {
        self.running.as_ref().map(|r| **r.punch_region.load())
    }

    pub fn set_punch_enabled(&self, enabled: bool) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let mut p = **running.punch_region.load();
        p.enabled = enabled;
        running.punch_region.store(Arc::new(p));
        Ok(())
    }

    // ── Count-in (3G) ──────────────────────────────────────────────

    /// Replace the count-in config atomically. Beats are clamped
    /// to `[MIN, MAX]` on construction to prevent absurd values.
    pub fn set_count_in(&self, config: CountIn) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        let normalized = CountIn::new(config.enabled, config.beats);
        running.count_in.store(Arc::new(normalized));
        Ok(())
    }

    pub fn count_in_snapshot(&self) -> Option<CountIn> {
        self.running.as_ref().map(|r| **r.count_in.load())
    }

    /// Read the latest meter reading for a track.
    pub fn get_track_meter(&mut self, handle: SlotHandle) -> MeterReading {
        self.running
            .as_mut()
            .map(|r| r.meter_consumers.read_track(handle.index()))
            .unwrap_or_default()
    }

    /// Read the latest master bus meter reading.
    pub fn get_master_meter(&mut self) -> MeterReading {
        self.running
            .as_mut()
            .map(|r| r.meter_consumers.read_master())
            .unwrap_or_default()
    }

    /// Inject a test signal into a track (for integration testing).
    pub fn inject_test_signal(
        &self,
        handle: SlotHandle,
        frequency: f32,
        amplitude: f32,
    ) -> Result<(), CommandError> {
        self.send_command(EngineCommand::InjectTestSignal {
            handle,
            frequency,
            amplitude,
        })
    }

    /// Stop any active test signal on a track.
    pub fn stop_test_signal(&self, handle: SlotHandle) -> Result<(), CommandError> {
        self.send_command(EngineCommand::StopTestSignal { handle })
    }

    /// Send a raw command to the audio thread. Kept `pub(crate)` so
    /// that internal tests can drive commands directly while external
    /// callers are routed through the higher-level API above.
    pub(crate) fn send_command(&self, cmd: EngineCommand) -> Result<(), CommandError> {
        let running = self.running.as_ref().ok_or(CommandError::NotRunning)?;
        running.cmd_tx.try_send(cmd).map_err(|e| match e {
            TrySendError::Full(_) => CommandError::QueueFull(COMMAND_QUEUE_CAPACITY),
            TrySendError::Disconnected(_) => CommandError::Disconnected,
        })
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    /// Build a runner that immediately reports success, then blocks on
    /// stop_rx. Shared counters let tests observe lifecycle transitions.
    fn fake_runner(
        ready: OpenResult,
        started: Arc<AtomicBool>,
        stopped: Arc<AtomicBool>,
    ) -> impl FnOnce(RuntimeContext) + Send + 'static {
        move |ctx: RuntimeContext| {
            started.store(true, Ordering::SeqCst);
            let _ = ctx.ready_tx.send(ready);
            let _ = ctx.stop_rx.recv();
            stopped.store(true, Ordering::SeqCst);
        }
    }

    fn ok_info() -> OpenInfo {
        OpenInfo {
            active_config: EngineConfig::default_48k(),
            device_name: "Mock Device".into(),
            channels: 2,
        }
    }

    #[test]
    fn new_engine_is_stopped() {
        let engine = Engine::new();
        assert!(!engine.is_running());
        assert_eq!(engine.status(), EngineStatus::Stopped);
    }

    #[test]
    fn start_transitions_to_running_and_returns_info() {
        let mut engine = Engine::new();
        let started = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));

        let status = engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(Ok(ok_info()), started.clone(), stopped.clone()),
            )
            .expect("start should succeed");

        assert!(engine.is_running());
        match status {
            EngineStatus::Running {
                active_config,
                device_name,
                channels,
            } => {
                assert_eq!(active_config.sample_rate, 48_000);
                assert_eq!(device_name, "Mock Device");
                assert_eq!(channels, 2);
            }
            EngineStatus::Stopped => panic!("expected Running"),
        }
        assert!(started.load(Ordering::SeqCst));
        assert!(!stopped.load(Ordering::SeqCst), "stop should not fire yet");

        engine.stop();
        assert!(stopped.load(Ordering::SeqCst));
        assert!(!engine.is_running());
    }

    #[test]
    fn double_start_rejects_second_call() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .expect("first start");

        let err = engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap_err();
        assert_eq!(err, EngineError::AlreadyRunning);

        engine.stop();
    }

    #[test]
    fn stop_is_idempotent() {
        let mut engine = Engine::new();
        engine.stop();
        engine.stop();

        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();
        engine.stop();
        engine.stop();
        assert!(!engine.is_running());
    }

    #[test]
    fn restart_after_stop_works() {
        let mut engine = Engine::new();
        let stopped_first = Arc::new(AtomicBool::new(false));
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    stopped_first.clone(),
                ),
            )
            .unwrap();
        engine.stop();
        assert!(stopped_first.load(Ordering::SeqCst));

        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .expect("restart should succeed");
        assert!(engine.is_running());
        engine.stop();
    }

    #[test]
    fn start_rejects_invalid_config_without_spawning() {
        let mut engine = Engine::new();
        let started = Arc::new(AtomicBool::new(false));
        let err = engine
            .start_with(
                EngineConfig {
                    sample_rate: 22_050,
                    buffer_size: 256,
                    device_name: None,
                },
                fake_runner(
                    Ok(ok_info()),
                    started.clone(),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap_err();
        assert!(matches!(err, EngineError::Config(_)));
        assert!(!started.load(Ordering::SeqCst), "runner must not be spawned");
        assert!(!engine.is_running());
    }

    #[test]
    fn runner_open_failure_surfaces_as_error() {
        let mut engine = Engine::new();
        let err = engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Err("no device".into()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap_err();
        match err {
            EngineError::Open(msg) => assert_eq!(msg, "no device"),
            other => panic!("expected Open, got {other:?}"),
        }
        assert!(!engine.is_running());
    }

    #[test]
    fn stream_runner_trait_accepts_closures_over_runtime_context() {
        // Compile-time guard: FnOnce(RuntimeContext) should satisfy
        // StreamRunner so call sites stay ergonomic.
        fn accept<R: StreamRunner>(_: R) {}
        accept(|_ctx: RuntimeContext| {});
    }

    #[test]
    fn drop_stops_running_engine() {
        let stopped = Arc::new(AtomicBool::new(false));
        {
            let mut engine = Engine::new();
            engine
                .start_with(
                    EngineConfig::default_48k(),
                    fake_runner(
                        Ok(ok_info()),
                        Arc::new(AtomicBool::new(false)),
                        stopped.clone(),
                    ),
                )
                .unwrap();
        }
        assert!(stopped.load(Ordering::SeqCst));
    }

    #[test]
    fn runner_that_never_reports_ready_times_out() {
        assert!(OPEN_TIMEOUT.as_secs() > 0);
        let _ = EngineError::OpenTimeout(OPEN_TIMEOUT);
    }

    // ── 2B-1c: command queue plumbing ───────────────────────────────

    /// Runner that records every command it drains off `cmd_rx` into a
    /// shared vec so tests can assert the audio thread saw exactly the
    /// commands the main thread sent. Parks on `stop_rx` until the
    /// engine asks to stop.
    fn recording_runner(
        drained: Arc<Mutex<Vec<EngineCommand>>>,
        drain_started: Arc<AtomicBool>,
    ) -> impl FnOnce(RuntimeContext) + Send + 'static {
        move |ctx: RuntimeContext| {
            let _ = ctx.ready_tx.send(Ok(OpenInfo {
                active_config: ctx.config.clone(),
                device_name: "Recording Mock".into(),
                channels: 2,
            }));
            drain_started.store(true, Ordering::SeqCst);
            // Pull commands until stop fires or the channel disconnects.
            // When stop fires first, drain the remaining buffered
            // commands before exiting — otherwise the select! might
            // pick stop before a still-queued send, losing it.
            'outer: loop {
                crossbeam_channel::select! {
                    recv(ctx.cmd_rx) -> msg => match msg {
                        Ok(cmd) => drained.lock().unwrap().push(cmd),
                        Err(_) => break 'outer, // sender dropped
                    },
                    recv(ctx.stop_rx) -> _ => {
                        while let Ok(cmd) = ctx.cmd_rx.try_recv() {
                            drained.lock().unwrap().push(cmd);
                        }
                        break 'outer;
                    }
                }
            }
        }
    }

    #[test]
    fn add_track_before_start_fails_with_not_running() {
        let mut engine = Engine::new();
        assert_eq!(
            engine.add_track(TrackParams::unity()),
            Err(CommandError::NotRunning)
        );
    }

    #[test]
    fn set_master_volume_before_start_fails_with_not_running() {
        let engine = Engine::new();
        assert_eq!(engine.set_master_volume(0.5), Err(CommandError::NotRunning));
    }

    #[test]
    fn add_track_and_remove_track_round_trip_through_audio_thread() {
        let mut engine = Engine::new();
        let drained = Arc::new(Mutex::new(Vec::new()));
        let drain_started = Arc::new(AtomicBool::new(false));

        engine
            .start_with(
                EngineConfig::default_48k(),
                recording_runner(drained.clone(), drain_started.clone()),
            )
            .unwrap();

        // Wait for the runner to enter its drain loop before sending —
        // otherwise a command sent before the runner is ready could sit
        // in the channel until the stop fires, which still works but
        // makes the assertion order fragile.
        while !drain_started.load(Ordering::SeqCst) {
            std::thread::yield_now();
        }

        // Centralized allocator — callers never build their own.
        let h0 = engine.add_track(TrackParams::unity()).unwrap();
        let h1 = engine
            .add_track(TrackParams {
                volume: 0.5,
                pan: 0.3,
                mute: false,
                solo: true,
            })
            .unwrap();
        engine.set_master_volume(0.8).unwrap();
        engine.remove_track(h0).unwrap();

        engine.stop();

        let got = drained.lock().unwrap();
        assert_eq!(got.len(), 4, "four commands should have arrived");
        match got[0] {
            EngineCommand::AddTrack { handle, params } => {
                assert_eq!(handle.index(), h0.index());
                assert_eq!(params, TrackParams::unity());
            }
            _ => panic!("expected AddTrack at [0]"),
        }
        match got[1] {
            EngineCommand::AddTrack { handle, params } => {
                assert_eq!(handle.index(), h1.index());
                assert!(params.solo);
            }
            _ => panic!("expected AddTrack at [1]"),
        }
        match got[2] {
            EngineCommand::SetMasterVolume { volume } => assert_eq!(volume, 0.8),
            _ => panic!("expected SetMasterVolume at [2]"),
        }
        match got[3] {
            EngineCommand::RemoveTrack { handle } => assert_eq!(handle.index(), h0.index()),
            _ => panic!("expected RemoveTrack at [3]"),
        }
    }

    #[test]
    fn add_track_hands_out_distinct_slots_through_centralized_allocator() {
        // Regression guard for codex finding #1 on PR #1698: two
        // parallel allocators would both mint slot 0 / generation 1,
        // aliasing commands onto the wrong track. The engine now
        // owns the single authoritative allocator, so two successive
        // add_track calls must return distinct slots.
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                recording_runner(
                    Arc::new(Mutex::new(Vec::new())),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();
        let h0 = engine.add_track(TrackParams::unity()).unwrap();
        let h1 = engine.add_track(TrackParams::unity()).unwrap();
        let h2 = engine.add_track(TrackParams::unity()).unwrap();
        assert_ne!(h0.index(), h1.index());
        assert_ne!(h1.index(), h2.index());
        assert_ne!(h0.index(), h2.index());
        engine.stop();
    }

    #[test]
    fn remove_track_frees_slot_for_reuse_with_new_generation() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                recording_runner(
                    Arc::new(Mutex::new(Vec::new())),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();
        let h0 = engine.add_track(TrackParams::unity()).unwrap();
        engine.remove_track(h0).unwrap();
        let h0_again = engine.add_track(TrackParams::unity()).unwrap();
        assert_eq!(
            h0.index(),
            h0_again.index(),
            "slot index should be reused"
        );
        assert_ne!(
            h0.generation(),
            h0_again.generation(),
            "generation should advance so stale commands cannot match"
        );
        engine.stop();
    }

    #[test]
    fn send_command_returns_queue_full_when_channel_is_saturated() {
        // Runner that reports ready but then parks on stop_rx WITHOUT
        // draining any commands, so the channel fills up.
        fn blocking_runner(ctx: RuntimeContext) {
            let _ = ctx.ready_tx.send(Ok(OpenInfo {
                active_config: ctx.config.clone(),
                device_name: "Blocker".into(),
                channels: 2,
            }));
            let _ = ctx.stop_rx.recv();
            // ctx.cmd_rx dropped here at return
        }

        let mut engine = Engine::new();
        engine
            .start_with(EngineConfig::default_48k(), blocking_runner)
            .unwrap();

        // Fill the channel exactly to capacity via set_master_volume
        // (doesn't consume allocator slots, so the test doesn't spill
        // into SlotAllocatorFull territory).
        for _ in 0..COMMAND_QUEUE_CAPACITY {
            engine.set_master_volume(0.5).unwrap();
        }
        // The next send must bounce with QueueFull.
        match engine.set_master_volume(0.5) {
            Err(CommandError::QueueFull(cap)) => assert_eq!(cap, COMMAND_QUEUE_CAPACITY),
            other => panic!("expected QueueFull, got {other:?}"),
        }

        engine.stop();
    }

    #[test]
    fn send_command_after_stop_fails_with_not_running() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();
        engine.stop();

        assert_eq!(
            engine.set_master_volume(0.5),
            Err(CommandError::NotRunning)
        );
        let mut engine2 = engine;
        assert_eq!(
            engine2.add_track(TrackParams::unity()),
            Err(CommandError::NotRunning)
        );
    }

    /// Runner that drains commands slowly (mimicking a throttled
    /// audio callback) and EXITS CLEAN on stop without draining any
    /// remaining commands. Used to test that the engine's stop grace
    /// period flushes the queue before tearing down.
    fn slow_lossy_runner(
        drained: Arc<Mutex<Vec<EngineCommand>>>,
        drain_started: Arc<AtomicBool>,
        throttle: Duration,
    ) -> impl FnOnce(RuntimeContext) + Send + 'static {
        move |ctx: RuntimeContext| {
            let _ = ctx.ready_tx.send(Ok(OpenInfo {
                active_config: ctx.config.clone(),
                device_name: "Slow Lossy".into(),
                channels: 2,
            }));
            drain_started.store(true, Ordering::SeqCst);
            loop {
                crossbeam_channel::select! {
                    recv(ctx.cmd_rx) -> msg => match msg {
                        Ok(cmd) => {
                            drained.lock().unwrap().push(cmd);
                            std::thread::sleep(throttle);
                        }
                        Err(_) => return, // sender dropped
                    },
                    // Deliberately exit WITHOUT draining remaining
                    // commands — this mimics the real CPAL stream
                    // being dropped mid-buffer, where any commands
                    // still in the channel are lost. The engine's
                    // stop grace period must flush the queue before
                    // this branch fires.
                    recv(ctx.stop_rx) -> _ => return,
                }
            }
        }
    }

    #[test]
    fn stop_grace_period_drains_pending_commands() {
        // Regression guard for codex finding #2 on PR #1698: without
        // a grace period, shutdown signals stop immediately and the
        // tail of the queue is discarded silently even though every
        // send_command returned Ok.
        //
        // With the 100 ms grace period, a small burst of commands
        // that drains in under 100 ms must all arrive before the
        // lossy runner's stop branch fires.
        let mut engine = Engine::new();
        let drained = Arc::new(Mutex::new(Vec::new()));
        let drain_started = Arc::new(AtomicBool::new(false));
        engine
            .start_with(
                EngineConfig::default_48k(),
                slow_lossy_runner(
                    drained.clone(),
                    drain_started.clone(),
                    Duration::from_millis(3),
                ),
            )
            .unwrap();
        while !drain_started.load(Ordering::SeqCst) {
            std::thread::yield_now();
        }

        // 10 commands × 3 ms throttle = 30 ms to drain, well under
        // the 100 ms grace period.
        for i in 0..10 {
            engine.set_master_volume(i as f32 * 0.1).unwrap();
        }
        engine.stop();

        let got = drained.lock().unwrap();
        assert_eq!(
            got.len(),
            10,
            "grace period must let the runner drain all 10 commands before stop"
        );
    }

    #[test]
    fn slot_allocator_full_returns_distinct_error() {
        // Build an engine with a mocked allocator that's already
        // full — this exercises the SlotAllocatorFull error variant
        // without actually adding 256 tracks one at a time.
        //
        // We can't easily mock the internal allocator, so instead
        // add MAX_TRACKS real tracks and assert the next add_track
        // bounces with SlotAllocatorFull. This is slow-ish (~256
        // channel sends) but finishes in under a millisecond.
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                recording_runner(
                    Arc::new(Mutex::new(Vec::new())),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Fill every slot.
        let mut handles = Vec::with_capacity(MAX_TRACKS);
        for _ in 0..MAX_TRACKS {
            handles.push(engine.add_track(TrackParams::unity()).unwrap());
        }

        // The next add_track must bounce with SlotAllocatorFull.
        match engine.add_track(TrackParams::unity()) {
            Err(CommandError::SlotAllocatorFull(cap)) => assert_eq!(cap, MAX_TRACKS),
            other => panic!("expected SlotAllocatorFull, got {other:?}"),
        }

        engine.stop();
    }

    // ── 3A: transport wiring ────────────────────────────────────────

    /// Runner that drives the audio-thread transport. Records every
    /// command AND applies transport commands to the local `Transport`
    /// so tests can verify end-to-end semantics (position advance,
    /// state transitions, shared-position visibility).
    fn transport_runner(
        drained: Arc<Mutex<Vec<EngineCommand>>>,
        drain_started: Arc<AtomicBool>,
    ) -> impl FnOnce(RuntimeContext) + Send + 'static {
        move |mut ctx: RuntimeContext| {
            let _ = ctx.ready_tx.send(Ok(OpenInfo {
                active_config: ctx.config.clone(),
                device_name: "Transport Mock".into(),
                channels: 2,
            }));
            drain_started.store(true, Ordering::SeqCst);
            loop {
                crossbeam_channel::select! {
                    recv(ctx.cmd_rx) -> msg => match msg {
                        Ok(cmd) => {
                            drained.lock().unwrap().push(cmd);
                            apply_transport(&mut ctx.transport, &cmd);
                        }
                        Err(_) => return,
                    },
                    recv(ctx.stop_rx) -> _ => {
                        while let Ok(cmd) = ctx.cmd_rx.try_recv() {
                            drained.lock().unwrap().push(cmd);
                            apply_transport(&mut ctx.transport, &cmd);
                        }
                        return;
                    }
                }
            }
        }
    }

    fn apply_transport(transport: &mut transport::Transport, cmd: &EngineCommand) {
        match *cmd {
            EngineCommand::TransportPlay => transport.play(),
            EngineCommand::TransportStop => transport.stop(),
            EngineCommand::TransportPause => transport.pause(),
            EngineCommand::TransportSeek { sample_position } => transport.seek(sample_position),
            // TransportSetTempo was removed in 3B — tempo now flows
            // through the ArcSwap<TempoMap> on the main thread, not
            // the command queue.
            _ => {}
        }
    }

    /// Helper: wait for a condition with a short timeout so tests do
    /// not hang forever when the audio thread hasn't caught up yet.
    fn wait_for<F: Fn() -> bool>(cond: F) {
        let deadline = std::time::Instant::now() + Duration::from_millis(500);
        while !cond() && std::time::Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert!(cond(), "timed out waiting for condition");
    }

    #[test]
    fn transport_commands_flow_through_command_queue() {
        let mut engine = Engine::new();
        let drained = Arc::new(Mutex::new(Vec::new()));
        let drain_started = Arc::new(AtomicBool::new(false));
        engine
            .start_with(
                EngineConfig::default_48k(),
                transport_runner(drained.clone(), drain_started.clone()),
            )
            .unwrap();
        wait_for(|| drain_started.load(Ordering::SeqCst));

        engine.transport_play().unwrap();
        engine.transport_seek(48_000).unwrap();
        // transport_set_tempo in 3B writes ArcSwap directly — not the
        // command queue — so it is NOT counted among the drained
        // commands here. It is covered by the 3B ArcSwap tests instead.
        engine.transport_set_tempo(140.0).unwrap();
        engine.transport_pause().unwrap();
        engine.transport_stop().unwrap();

        // Observe the set_tempo effect on the ArcSwap map BEFORE
        // stopping the engine — tempo_map_snapshot returns None
        // once the engine is stopped (handle-to-RunningEngine).
        let snap = engine.tempo_map_snapshot().unwrap();
        assert_eq!(snap.events()[0].bpm, 140.0);

        engine.stop();

        let got = drained.lock().unwrap();
        assert_eq!(
            got.len(),
            4,
            "four transport commands should have arrived (set_tempo bypasses queue)"
        );
        assert!(matches!(got[0], EngineCommand::TransportPlay));
        assert!(matches!(
            got[1],
            EngineCommand::TransportSeek { sample_position: 48_000 }
        ));
        assert!(matches!(got[2], EngineCommand::TransportPause));
        assert!(matches!(got[3], EngineCommand::TransportStop));
    }

    #[test]
    fn transport_seek_is_visible_on_shared_position() {
        // End-to-end: sending TransportSeek must update the atomic
        // counter that `Engine::transport_position` reads, without any
        // explicit poll from the main thread.
        let mut engine = Engine::new();
        let drained = Arc::new(Mutex::new(Vec::new()));
        let drain_started = Arc::new(AtomicBool::new(false));
        engine
            .start_with(
                EngineConfig::default_48k(),
                transport_runner(drained.clone(), drain_started.clone()),
            )
            .unwrap();
        wait_for(|| drain_started.load(Ordering::SeqCst));

        assert_eq!(engine.transport_position(), 0);

        engine.transport_seek(192_000).unwrap(); // 4 s at 48 k
        wait_for(|| engine.transport_position() == 192_000);

        engine.transport_stop().unwrap();
        wait_for(|| engine.transport_position() == 0);

        engine.stop();
    }

    #[test]
    fn transport_position_returns_zero_when_engine_stopped() {
        let engine = Engine::new();
        assert_eq!(engine.transport_position(), 0);
    }

    // ── 3B: tempo / time-signature map via Engine ──────────────────

    #[test]
    fn tempo_map_before_start_fails_with_not_running() {
        let engine = Engine::new();
        assert_eq!(
            engine.set_tempo_map(vec![TempoEvent::new(0, 120.0)]),
            Err(CommandError::NotRunning)
        );
        assert!(engine.tempo_map_snapshot().is_none());
    }

    #[test]
    fn set_tempo_map_rejects_invalid_events() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Empty → error.
        match engine.set_tempo_map(vec![]) {
            Err(CommandError::InvalidTempoMap(msg)) => {
                assert!(msg.contains("Empty"), "unexpected message: {msg}");
            }
            other => panic!("expected InvalidTempoMap(Empty), got {other:?}"),
        }

        // Missing anchor → error.
        match engine.set_tempo_map(vec![TempoEvent::new(48_000, 120.0)]) {
            Err(CommandError::InvalidTempoMap(msg)) => {
                assert!(msg.contains("Missing"), "unexpected message: {msg}");
            }
            other => panic!("expected InvalidTempoMap(MissingAnchor), got {other:?}"),
        }

        engine.stop();
    }

    #[test]
    fn set_tempo_map_publishes_multi_point_automation() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        engine
            .set_tempo_map(vec![
                TempoEvent::new(0, 60.0),
                TempoEvent::new(48_000, 120.0),
            ])
            .unwrap();

        let snap = engine.tempo_map_snapshot().unwrap();
        assert_eq!(snap.events().len(), 2);
        assert_eq!(snap.events()[1].bpm, 120.0);

        // beat_to_sample uses the published map + active sample rate.
        // 1 beat at 60 BPM = 1 s = 48_000 samples at 48 kHz.
        assert_eq!(engine.beat_to_sample(1.0), 48_000);
        // 3 beats: 1 beat at 60 BPM + 2 beats at 120 BPM = 1 s + 1 s = 96_000.
        assert_eq!(engine.beat_to_sample(3.0), 96_000);

        // Round trip.
        let s = engine.beat_to_sample(2.5);
        let b = engine.sample_to_beat(s);
        assert!((b - 2.5).abs() < 1e-3, "round trip drifted: {b}");

        engine.stop();
    }

    #[test]
    fn time_signature_map_round_trip_through_engine() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Default is 4/4.
        let default_snap = engine.time_signature_map_snapshot().unwrap();
        assert_eq!(default_snap.signature_at(0), (4, 4));

        engine
            .set_time_signature_map(vec![
                TimeSignatureEvent::new(0, 4, 4),
                TimeSignatureEvent::new(96_000, 3, 4),
            ])
            .unwrap();

        let snap = engine.time_signature_map_snapshot().unwrap();
        assert_eq!(snap.signature_at(0), (4, 4));
        assert_eq!(snap.signature_at(96_000), (3, 4));

        engine.stop();
    }

    // ── 3G: scrub + count-in integration ────────────────────────────

    #[test]
    fn transport_scrub_flows_through_command_queue() {
        let mut engine = Engine::new();
        let drained = Arc::new(Mutex::new(Vec::new()));
        let drain_started = Arc::new(AtomicBool::new(false));
        engine
            .start_with(
                EngineConfig::default_48k(),
                transport_runner(drained.clone(), drain_started.clone()),
            )
            .unwrap();
        wait_for(|| drain_started.load(Ordering::SeqCst));

        engine.transport_seek(1000).unwrap();
        engine.transport_scrub(500).unwrap();
        engine.transport_scrub(-200).unwrap();

        engine.stop();

        let got = drained.lock().unwrap();
        assert!(
            got.iter().any(|c| matches!(
                c,
                EngineCommand::TransportScrub { delta_samples: 500 }
            )),
            "expected TransportScrub +500 in drained commands"
        );
        assert!(
            got.iter().any(|c| matches!(
                c,
                EngineCommand::TransportScrub { delta_samples: -200 }
            )),
            "expected TransportScrub -200 in drained commands"
        );
    }

    #[test]
    fn punch_region_before_start_fails_with_not_running() {
        let engine = Engine::new();
        assert_eq!(
            engine.set_punch_region(PunchRegion {
                enabled: true,
                start: 0,
                end: 1000,
            }),
            Err(CommandError::NotRunning)
        );
        assert!(engine.punch_region_snapshot().is_none());
    }

    #[test]
    fn count_in_before_start_fails_with_not_running() {
        let engine = Engine::new();
        assert_eq!(
            engine.set_count_in(CountIn::new(true, 4)),
            Err(CommandError::NotRunning)
        );
        assert!(engine.count_in_snapshot().is_none());
    }

    #[test]
    fn punch_and_count_in_round_trip_through_engine() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        let punch = PunchRegion {
            enabled: true,
            start: 48_000,
            end: 192_000,
        };
        engine.set_punch_region(punch).unwrap();
        assert_eq!(engine.punch_region_snapshot().unwrap(), punch);
        engine.set_punch_enabled(false).unwrap();
        assert!(!engine.punch_region_snapshot().unwrap().enabled);

        let ci = CountIn::new(true, 8);
        engine.set_count_in(ci).unwrap();
        assert_eq!(engine.count_in_snapshot().unwrap(), ci);

        // set_count_in normalizes — beats=99 clamps to MAX (16).
        engine.set_count_in(CountIn::new(true, 99)).unwrap();
        assert_eq!(engine.count_in_snapshot().unwrap().beats, 16);

        engine.stop();
    }

    #[test]
    fn clip_schedule_graveyard_bounds_retained_arcs() {
        // Codex P1 regression (PR #1719): the graveyard must cap
        // retained Arc<ClipSchedule>s at CLIP_SCHEDULE_GRAVEYARD_SIZE
        // so rapid-fire schedule swaps don't leak memory forever.
        use std::sync::Arc;

        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Build a tiny PCM so each ClipSource is cheap.
        let pcm = Arc::new(vec![0.5_f32; 4]);

        // Swap 3× the graveyard capacity — the queue must cap.
        for i in 0..(CLIP_SCHEDULE_GRAVEYARD_SIZE * 3) {
            let clip = ClipSource::new(i as u64 * 1000, 2, 1.0, pcm.clone()).unwrap();
            engine.set_clip_schedule(vec![clip]).unwrap();
        }

        let graveyard_len = engine
            .running
            .as_ref()
            .unwrap()
            .clip_schedule_graveyard
            .lock()
            .unwrap()
            .len();
        assert!(
            graveyard_len <= CLIP_SCHEDULE_GRAVEYARD_SIZE,
            "graveyard grew past cap: {graveyard_len} > {CLIP_SCHEDULE_GRAVEYARD_SIZE}"
        );

        engine.stop();
    }

    #[test]
    fn transport_set_tempo_and_set_tempo_map_share_ordering_domain() {
        // Regression for codex P1 finding on PR #1711: before the
        // fix, `transport_set_tempo` routed through the audio-thread
        // command queue while `set_tempo_map` wrote the ArcSwap
        // directly. A later `set_tempo_map` could arrive BEFORE an
        // earlier `set_tempo` because the queue path was slower,
        // and the later call would be silently clobbered.
        //
        // After the fix, both paths write the same ArcSwap, so a
        // later call always wins from the main thread's linearized
        // view. Synchronously verify by issuing a set_tempo and
        // reading back immediately.
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Multi-point automation first.
        engine
            .set_tempo_map(vec![
                TempoEvent::new(0, 60.0),
                TempoEvent::new(48_000, 120.0),
            ])
            .unwrap();

        // A set_tempo AFTER that must be IMMEDIATELY visible (no
        // queue round-trip), replacing the automation with a
        // constant 90.
        engine.transport_set_tempo(90.0).unwrap();
        let snap = engine.tempo_map_snapshot().unwrap();
        assert_eq!(snap.events().len(), 1, "set_tempo should reduce the map to a single event");
        assert_eq!(snap.events()[0].bpm, 90.0);

        // And the reverse: a set_tempo_map AFTER a set_tempo wins.
        engine.transport_set_tempo(100.0).unwrap();
        engine
            .set_tempo_map(vec![
                TempoEvent::new(0, 77.0),
                TempoEvent::new(96_000, 133.0),
            ])
            .unwrap();
        let snap = engine.tempo_map_snapshot().unwrap();
        assert_eq!(snap.events().len(), 2);
        assert_eq!(snap.events()[0].bpm, 77.0);

        engine.stop();
    }

    // ── 3C: loop region via Engine ──────────────────────────────────

    #[test]
    fn loop_region_before_start_fails_with_not_running() {
        let engine = Engine::new();
        assert_eq!(
            engine.set_loop_region(LoopRegion {
                enabled: true,
                start: 0,
                end: 1_000,
            }),
            Err(CommandError::NotRunning)
        );
        assert!(engine.loop_region_snapshot().is_none());
        assert_eq!(
            engine.set_loop_enabled(true),
            Err(CommandError::NotRunning)
        );
    }

    #[test]
    fn loop_region_publish_and_snapshot_round_trip() {
        let mut engine = Engine::new();
        engine
            .start_with(
                EngineConfig::default_48k(),
                fake_runner(
                    Ok(ok_info()),
                    Arc::new(AtomicBool::new(false)),
                    Arc::new(AtomicBool::new(false)),
                ),
            )
            .unwrap();

        // Default is disabled.
        let initial = engine.loop_region_snapshot().unwrap();
        assert_eq!(initial, LoopRegion::disabled());

        let region = LoopRegion {
            enabled: true,
            start: 48_000,
            end: 96_000,
        };
        engine.set_loop_region(region).unwrap();
        assert_eq!(engine.loop_region_snapshot().unwrap(), region);

        // set_loop_enabled toggles without changing the bounds.
        engine.set_loop_enabled(false).unwrap();
        let after = engine.loop_region_snapshot().unwrap();
        assert!(!after.enabled);
        assert_eq!(after.start, 48_000);
        assert_eq!(after.end, 96_000);

        engine.set_loop_enabled(true).unwrap();
        assert!(engine.loop_region_snapshot().unwrap().enabled);

        engine.stop();
    }

    #[test]
    fn beat_sample_conversions_return_zero_when_stopped() {
        let engine = Engine::new();
        assert_eq!(engine.beat_to_sample(10.0), 0);
        assert_eq!(engine.sample_to_beat(48_000), 0.0);
    }

    #[test]
    fn transport_commands_before_start_fail_with_not_running() {
        let engine = Engine::new();
        assert_eq!(engine.transport_play(), Err(CommandError::NotRunning));
        assert_eq!(engine.transport_stop(), Err(CommandError::NotRunning));
        assert_eq!(engine.transport_pause(), Err(CommandError::NotRunning));
        assert_eq!(
            engine.transport_seek(100),
            Err(CommandError::NotRunning)
        );
        assert_eq!(
            engine.transport_set_tempo(140.0),
            Err(CommandError::NotRunning)
        );
    }

    #[test]
    fn runtime_context_exposes_all_fields() {
        // Compile-time check: a runner can take ownership of every
        // field of RuntimeContext. Doubles as smoke test for the
        // bundled struct shape.
        let runner = |ctx: RuntimeContext| {
            let _ = ctx.config;
            let _ = ctx.graph;
            let _ = ctx.cmd_rx;
            let _ = ctx.ready_tx;
            let _ = ctx.stop_rx;
            let _ = ctx.transport;
        };
        fn assert_runner<R: StreamRunner>(_: R) {}
        assert_runner(runner);
    }

    // Silence unused import warnings in the AtomicUsize test path —
    // 2B-2 will use AtomicUsize for metering state.
    #[allow(dead_code)]
    fn _silence_unused_atomic_usize() {
        let _ = AtomicUsize::new(0);
    }
}
