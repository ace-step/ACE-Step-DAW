//! Transport state machine + lock-free sample-position counter.
//!
//! # Why a dedicated module?
//!
//! Transport is the clock of the whole engine: every downstream system
//! (clip scheduler, loop wrap, metronome, UI position badge) reads the
//! same `SharedPosition` and acts on the same `TransportState`. Keeping
//! both in one place means there is exactly one source of truth for
//! "where are we in the timeline, and is playback live?"
//!
//! # Real-time safety
//!
//! - `TransportState` is a flat `Copy` enum — zero heap, zero drop glue.
//! - `SharedPosition` wraps `Arc<AtomicU64>` so the audio thread can
//!   publish the sample offset with a plain atomic store, and the UI
//!   thread can snapshot it with an atomic load. No locks, no channels
//!   needed for the read path.
//! - `Ordering::Relaxed` is sufficient for both sides. The invariant
//!   that justifies Relaxed is **single-writer**, not monotonicity: the
//!   audio callback is the only thread that mutates the counter, so
//!   readers never see torn or reordered writes. The counter is *not*
//!   strictly monotonic — `Seek` jumps to an arbitrary position,
//!   `Stop` rewinds to 0, and `Scrubbing` can move backwards — but a
//!   single-producer / multi-consumer counter without inter-location
//!   ordering requirements does not need anything stronger than
//!   Relaxed. This matches the existing meter pattern in
//!   `meter_bank.rs`.
//!
//! # Scope
//!
//! Phase 3A ships only: state machine, single-BPM baseline, atomic
//! position counter, and the five core commands
//! (play/pause/stop/seek/set_tempo). Tempo maps (3B), loop regions
//! (3C), UI event emission (3D), metronome (3E), and clip scheduling
//! (3F) layer on top.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use arc_swap::ArcSwap;

use super::clip::ClipSchedule;
use super::count_in::CountIn;
use super::loop_region::LoopRegion;
use super::metronome::MetronomeConfig;
use super::punch_region::PunchRegion;
use super::tempo_map::TempoMap;
use super::time_sig_map::TimeSignatureMap;

/// Transport state machine — mirrors the five modes every classic DAW
/// transport exposes. Flat `Copy` so commands can carry it without
/// allocation; `PartialEq` so tests can assert exact values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportState {
    /// Transport is at rest AND position is at 0. This is the cold
    /// start state and the state after `Stop`.
    Stopped,
    /// Transport is at rest but the position counter holds a non-zero
    /// value from a prior `Play`. Next `Play` resumes from this
    /// position. Distinct from `Stopped` so downstream consumers (UI
    /// badge, clip scheduler cache) can tell "user hit stop" apart
    /// from "user hit pause" — they have different semantics for
    /// cursor placement and clip-preview caching.
    Paused,
    /// Transport is advancing at 1× speed. Position increments by
    /// `frames` on every audio callback.
    Playing,
    /// Transport is advancing AND recording is armed. For 3A this
    /// behaves identically to `Playing` on the render side; real
    /// recording lands in a later phase once file I/O is wired.
    Recording,
    /// Transport is being dragged by the user (scrub). Position may
    /// jump non-monotonically; rendering may use short fade-ins to
    /// avoid clicks. Also behaves like `Playing` for position advance
    /// in 3A; true scrub semantics land in 3G.
    Scrubbing,
}

impl TransportState {
    /// Whether the audio callback should auto-advance the sample
    /// counter this buffer.
    ///
    /// **Scrubbing is NOT advancing** in the 3G sense: during a
    /// scrub, the playhead moves only in response to explicit
    /// user-driven `transport_scrub(delta)` commands, not by
    /// buffer-linear auto-advance. Clip rendering and metronome
    /// clicks are also gated on this flag, so a scrubbing
    /// transport produces no audible output — matching the
    /// "silent scrub" UX of most native DAWs.
    #[inline]
    pub fn is_advancing(self) -> bool {
        matches!(
            self,
            TransportState::Playing | TransportState::Recording
        )
    }
}

impl Default for TransportState {
    fn default() -> Self {
        TransportState::Stopped
    }
}

/// Lock-free sample-position counter shared between the audio thread
/// (writer) and readers (UI poll, Tauri command handler, future clip
/// scheduler).
///
/// Positions are stored in samples (not seconds or beats) so that every
/// downstream computation stays integer-exact relative to the sample
/// rate. A 64-bit counter at 192 kHz can express ~3 million years of
/// continuous playback, which is enough.
#[derive(Debug, Clone)]
pub struct SharedPosition(Arc<AtomicU64>);

impl SharedPosition {
    pub fn new() -> Self {
        Self(Arc::new(AtomicU64::new(0)))
    }

    /// Snapshot the current position. Safe to call from any thread.
    #[inline]
    pub fn get(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }

    /// Overwrite the position atomically. Used by Seek and by Stop
    /// (which rewinds to 0).
    #[inline]
    pub fn set(&self, samples: u64) {
        self.0.store(samples, Ordering::Relaxed);
    }

    /// Advance the position by `frames` samples and return the new
    /// value. Used by the audio callback on every buffer when the
    /// transport is advancing.
    #[inline]
    pub fn advance(&self, frames: u64) -> u64 {
        // fetch_add returns the PREVIOUS value, so add `frames` to
        // get the new one. Using Relaxed is fine: the audio callback
        // is the single writer, and readers only need monotonic
        // within a run.
        self.0.fetch_add(frames, Ordering::Relaxed) + frames
    }
}

impl Default for SharedPosition {
    fn default() -> Self {
        Self::new()
    }
}

/// Minimum and maximum BPM the transport will accept. Clamped on
/// `set_tempo` to protect the sample/beat conversion math in 3B from
/// pathological inputs (BPM=0 would divide by zero; BPM=1e9 would
/// overflow the scheduler).
pub const MIN_BPM: f32 = 20.0;
pub const MAX_BPM: f32 = 999.0;
/// Sensible default BPM when nothing else is set.
pub const DEFAULT_BPM: f32 = 120.0;

/// Audio-thread transport state. Owned by the audio callback; the
/// main thread mutates it indirectly through [`EngineCommand`]s.
///
/// Intentionally **not** `Clone`: the `Relaxed` ordering on
/// [`SharedPosition`] is only sound under a single-writer contract,
/// and a cloned `Transport` would share the atomic counter while
/// holding an independent `state`/`bpm` — two writers could then
/// race on the same counter and diverge on their local state. The
/// shared handle (for read-only position snapshots) is
/// [`SharedPosition`], which *is* clonable.
#[derive(Debug)]
pub struct Transport {
    state: TransportState,
    /// Shared sample-position counter. Single-writer (the audio
    /// callback) but NOT strictly monotonic — `Seek` / `Stop` /
    /// `Scrubbing` can jump it backwards or to zero. Readers on
    /// other threads see every write but may observe a stale value
    /// for up to one callback.
    position: SharedPosition,
    /// Tempo automation. Shared via `ArcSwap` so the main thread can
    /// publish a new map without blocking the audio thread — the
    /// audio callback does a wait-free `.load()` on each buffer.
    /// Replaces the single `bpm` field from 3A; for a constant tempo
    /// this holds a single-event map, which is what
    /// [`Transport::set_tempo`] builds under the hood.
    tempo_map: Arc<ArcSwap<TempoMap>>,
    /// Time signature automation. Same `ArcSwap` pattern as
    /// `tempo_map`. The audio engine itself does not use the time
    /// signature — it is a pure UI/metronome concern — but lives on
    /// `Transport` so that 3E's metronome and the UI can pull from a
    /// single source of truth.
    time_sig_map: Arc<ArcSwap<TimeSignatureMap>>,
    /// Loop region. When active, the audio callback wraps the
    /// playhead from `end` back to `start` as playback crosses the
    /// end boundary. Shared via `ArcSwap` so the main thread can
    /// toggle / move the region without blocking the audio thread
    /// — the callback does a wait-free `.load()` on each buffer.
    loop_region: Arc<ArcSwap<LoopRegion>>,
    /// Metronome config (enable/volume/frequency). Audio-thread
    /// click state lives separately — only the config is shared.
    metronome_config: Arc<ArcSwap<MetronomeConfig>>,
    /// Clip schedule — the set of PCM clips to mix into the master
    /// bus at their scheduled sample positions. Shared via
    /// `ArcSwap` so the main thread can replace the whole set
    /// without blocking the audio callback.
    clip_schedule: Arc<ArcSwap<ClipSchedule>>,
    /// Punch (record-arm) region. State-only in 3G — UI queries
    /// it; future recording code will gate capture on
    /// `is_active() && contains(playhead)`.
    punch_region: Arc<ArcSwap<PunchRegion>>,
    /// Count-in config. The audio callback owns a separate
    /// `CountInState` (countdown) that's started from this config
    /// when TransportPlay is received.
    count_in: Arc<ArcSwap<CountIn>>,
}

impl Transport {
    /// Fresh transport: Stopped at sample 0, 120 BPM, 4/4, no loop,
    /// metronome off.
    pub fn new() -> Self {
        Self {
            state: TransportState::Stopped,
            position: SharedPosition::new(),
            tempo_map: Arc::new(ArcSwap::from_pointee(TempoMap::new_constant(DEFAULT_BPM))),
            time_sig_map: Arc::new(ArcSwap::from_pointee(TimeSignatureMap::default())),
            loop_region: Arc::new(ArcSwap::from_pointee(LoopRegion::disabled())),
            metronome_config: Arc::new(ArcSwap::from_pointee(MetronomeConfig::default_off())),
            clip_schedule: Arc::new(ArcSwap::from_pointee(ClipSchedule::empty())),
            punch_region: Arc::new(ArcSwap::from_pointee(PunchRegion::disabled())),
            count_in: Arc::new(ArcSwap::from_pointee(CountIn::default_off())),
        }
    }

    pub fn state(&self) -> TransportState {
        self.state
    }

    pub fn position(&self) -> u64 {
        self.position.get()
    }

    /// Current BPM at the current position. For constant tempo this
    /// is the single event's BPM; for automation it reflects whatever
    /// segment the playhead is in.
    pub fn bpm(&self) -> f32 {
        self.tempo_map.load().bpm_at(self.position.get())
    }

    /// Hand out a clone of the shared position counter so external
    /// readers (UI poller, Tauri command) can snapshot it without
    /// going through the command queue.
    pub fn shared_position(&self) -> SharedPosition {
        self.position.clone()
    }

    /// Clone the tempo-map handle. The returned `Arc<ArcSwap<_>>` is
    /// the same cell as the audio thread sees — main-thread mutations
    /// via `store` are visible to the audio thread on the next
    /// `.load()`. Read-only on the audio side.
    pub fn tempo_map_handle(&self) -> Arc<ArcSwap<TempoMap>> {
        self.tempo_map.clone()
    }

    /// Clone the time-signature-map handle. See
    /// [`tempo_map_handle`](Self::tempo_map_handle) for semantics.
    pub fn time_sig_map_handle(&self) -> Arc<ArcSwap<TimeSignatureMap>> {
        self.time_sig_map.clone()
    }

    /// Clone the loop-region handle. Read-only on the audio side;
    /// main thread publishes via `.store(Arc::new(new))`.
    pub fn loop_region_handle(&self) -> Arc<ArcSwap<LoopRegion>> {
        self.loop_region.clone()
    }

    /// Snapshot the current loop region. Cheap — `ArcSwap::load` is
    /// wait-free and returns a lightweight guard.
    pub fn loop_region_snapshot(&self) -> LoopRegion {
        **self.loop_region.load()
    }

    /// Replace the loop region atomically.
    pub fn replace_loop_region(&mut self, region: LoopRegion) {
        self.loop_region.store(Arc::new(region));
    }

    /// Clone the metronome-config handle. Audio thread reads via
    /// wait-free `.load()`, main thread publishes via `.store`.
    pub fn metronome_config_handle(&self) -> Arc<ArcSwap<MetronomeConfig>> {
        self.metronome_config.clone()
    }

    /// Snapshot the current metronome config.
    pub fn metronome_config_snapshot(&self) -> MetronomeConfig {
        **self.metronome_config.load()
    }

    /// Replace the metronome config atomically.
    pub fn replace_metronome_config(&mut self, config: MetronomeConfig) {
        self.metronome_config.store(Arc::new(config));
    }

    /// Clone the clip-schedule handle. Audio thread reads via
    /// wait-free `.load()`, main thread publishes via `.store`.
    pub fn clip_schedule_handle(&self) -> Arc<ArcSwap<ClipSchedule>> {
        self.clip_schedule.clone()
    }

    /// Replace the clip schedule atomically.
    pub fn replace_clip_schedule(&mut self, schedule: ClipSchedule) {
        self.clip_schedule.store(Arc::new(schedule));
    }

    // ── Punch (3G) ──────────────────────────────────────────────────

    pub fn punch_region_handle(&self) -> Arc<ArcSwap<PunchRegion>> {
        self.punch_region.clone()
    }

    pub fn punch_region_snapshot(&self) -> PunchRegion {
        **self.punch_region.load()
    }

    pub fn replace_punch_region(&mut self, region: PunchRegion) {
        self.punch_region.store(Arc::new(region));
    }

    // ── Count-in (3G) ───────────────────────────────────────────────

    pub fn count_in_handle(&self) -> Arc<ArcSwap<CountIn>> {
        self.count_in.clone()
    }

    pub fn count_in_snapshot(&self) -> CountIn {
        **self.count_in.load()
    }

    pub fn replace_count_in(&mut self, config: CountIn) {
        self.count_in.store(Arc::new(config));
    }

    /// Snapshot the current tempo map. Cheap — `.load()` is wait-free
    /// and the returned `Arc<TempoMap>` is a counted reference, not a
    /// deep clone.
    pub fn tempo_map_snapshot(&self) -> Arc<TempoMap> {
        self.tempo_map.load_full()
    }

    /// Snapshot the current time-signature map.
    pub fn time_sig_map_snapshot(&self) -> Arc<TimeSignatureMap> {
        self.time_sig_map.load_full()
    }

    /// Begin playback from the current position.
    pub fn play(&mut self) {
        self.state = TransportState::Playing;
    }

    /// Stop playback AND rewind to position 0. Matches the standard
    /// Space-bar-while-stopped behavior in every major DAW.
    pub fn stop(&mut self) {
        self.state = TransportState::Stopped;
        self.position.set(0);
    }

    /// Stop playback but KEEP the current position. Equivalent to
    /// Pro Tools / Logic's pause — next play resumes from here.
    /// Distinct from [`stop`](Self::stop) (which also rewinds).
    pub fn pause(&mut self) {
        self.state = TransportState::Paused;
    }

    /// Jump to an absolute sample position. Does not change the state.
    pub fn seek(&mut self, sample: u64) {
        self.position.set(sample);
    }

    /// Scrub: move the playhead by a signed sample delta and
    /// transition to `Scrubbing` state. Positive deltas move
    /// forward, negative move backward. Uses saturating
    /// arithmetic so a huge negative delta underflows to 0 rather
    /// than wrapping around to near u64::MAX.
    ///
    /// Does NOT auto-wrap on the loop region — scrub is a
    /// deliberate user gesture; if they drag past the loop end,
    /// they want to be past the loop, not bounced back. Matches
    /// the Pro Tools convention.
    pub fn scrub(&mut self, delta_samples: i64) {
        self.state = TransportState::Scrubbing;
        let current = self.position.get();
        let next = if delta_samples >= 0 {
            current.saturating_add(delta_samples as u64)
        } else {
            current.saturating_sub(delta_samples.unsigned_abs())
        };
        self.position.set(next);
    }

    /// Set a constant tempo by swapping in a single-event map. For
    /// multi-point tempo automation, use
    /// [`replace_tempo_map`](Self::replace_tempo_map) instead.
    ///
    /// Clamping / NaN handling lives in
    /// [`super::tempo_map::TempoEvent::new`] so there is one
    /// canonical definition of "valid BPM".
    pub fn set_tempo(&mut self, bpm: f32) {
        self.tempo_map
            .store(Arc::new(TempoMap::new_constant(bpm)));
    }

    /// Replace the full tempo map atomically. The caller is
    /// responsible for supplying a validated
    /// [`super::tempo_map::TempoMap`] (built via
    /// [`super::tempo_map::TempoMap::try_new`]).
    pub fn replace_tempo_map(&mut self, map: TempoMap) {
        self.tempo_map.store(Arc::new(map));
    }

    /// Replace the full time-signature map atomically.
    pub fn replace_time_signature_map(&mut self, map: TimeSignatureMap) {
        self.time_sig_map.store(Arc::new(map));
    }

    /// Called by the audio callback once per buffer. Advances the
    /// position if the transport is in *any* advancing state
    /// (`Playing`, `Recording`, or `Scrubbing` — see
    /// [`TransportState::is_advancing`]). No-op for `Stopped` and
    /// `Paused`.
    ///
    /// Kept for tests and for callers that explicitly want to ignore
    /// the loop region. The production audio callback uses
    /// [`advance_with_loop_if_advancing`] instead.
    #[inline]
    pub fn advance_if_advancing(&mut self, frames: u64) {
        if self.state.is_advancing() {
            self.position.advance(frames);
        }
    }

    /// Called by the audio callback once per buffer. Like
    /// [`advance_if_advancing`] but reads the current loop region
    /// snapshot and wraps the playhead if the advance crosses the
    /// loop end boundary.
    ///
    /// The wrap math lives in [`LoopRegion::next_position`], so
    /// this method is a thin audio-callback-friendly wrapper — no
    /// allocation, no locks, one `ArcSwap::load` + at most one
    /// atomic read-modify-write. Safe to call from the audio thread.
    ///
    /// **Fast path** — when the loop is inactive (the common case
    /// during single-shot playback), we delegate to
    /// `SharedPosition::advance`, which uses a single `fetch_add`
    /// atomic RMW. Only the active-loop path needs the more
    /// expensive load + compute + store, because we have to re-read
    /// the cursor to decide whether the advance crosses the end
    /// boundary. Copilot review noted the inactive case was paying
    /// extra atomics for nothing (PR #1713).
    #[inline]
    pub fn advance_with_loop_if_advancing(&mut self, frames: u64) {
        if !self.state.is_advancing() {
            return;
        }
        let region = **self.loop_region.load();
        if !region.is_active() {
            self.position.advance(frames);
            return;
        }
        let current = self.position.get();
        let next = region.next_position(current, frames);
        // Skip the store if the advance landed exactly where the
        // non-wrap path would have, which is the 99% case when the
        // playhead is outside the loop range entirely. `advance`
        // does a single RMW and matches what the caller wants.
        if next == current.saturating_add(frames) {
            self.position.advance(frames);
        } else {
            // Wrap happened — need an absolute set, not a delta.
            self.position.set(next);
        }
    }
}

impl Default for Transport {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_transport_is_stopped_at_zero() {
        let t = Transport::new();
        assert_eq!(t.state(), TransportState::Stopped);
        assert_eq!(t.position(), 0);
        assert_eq!(t.bpm(), DEFAULT_BPM);
    }

    #[test]
    fn play_transitions_state_without_moving_position() {
        let mut t = Transport::new();
        t.seek(48_000); // 1 s at 48 kHz
        t.play();
        assert_eq!(t.state(), TransportState::Playing);
        assert_eq!(t.position(), 48_000);
    }

    #[test]
    fn stop_rewinds_position_to_zero() {
        let mut t = Transport::new();
        t.seek(96_000);
        t.play();
        t.stop();
        assert_eq!(t.state(), TransportState::Stopped);
        assert_eq!(t.position(), 0);
    }

    #[test]
    fn pause_preserves_position_and_uses_dedicated_paused_state() {
        let mut t = Transport::new();
        t.seek(96_000);
        t.play();
        t.pause();
        assert_eq!(
            t.state(),
            TransportState::Paused,
            "pause must produce Paused, not Stopped — \
             downstream consumers distinguish 'stopped' (cursor at 0) \
             from 'paused' (cursor preserved) and they have different \
             semantics for clip-preview caching and UI badging"
        );
        assert_eq!(
            t.position(),
            96_000,
            "pause must leave the position counter intact"
        );
    }

    #[test]
    fn paused_state_does_not_advance_position() {
        let mut t = Transport::new();
        t.play();
        t.advance_if_advancing(256);
        t.pause();
        t.advance_if_advancing(256);
        assert_eq!(
            t.position(),
            256,
            "paused transport must not advance on subsequent buffers"
        );
        // Resuming play picks up from where pause left off.
        t.play();
        t.advance_if_advancing(256);
        assert_eq!(t.position(), 512);
    }

    #[test]
    fn seek_sets_position_in_any_state() {
        let mut t = Transport::new();
        t.seek(12_345);
        assert_eq!(t.position(), 12_345);
        t.play();
        t.seek(54_321);
        assert_eq!(t.position(), 54_321);
        t.stop();
        // stop rewinds, then seek wins because we re-seek after
        t.seek(7);
        assert_eq!(t.position(), 7);
    }

    #[test]
    fn advance_only_runs_when_state_is_advancing() {
        let mut t = Transport::new();
        // Stopped: no advance.
        t.advance_if_advancing(256);
        assert_eq!(t.position(), 0);

        // Playing: advance.
        t.play();
        t.advance_if_advancing(256);
        t.advance_if_advancing(256);
        assert_eq!(t.position(), 512);

        // Pause: advance stops AND state is Paused (distinct from Stopped).
        t.pause();
        assert_eq!(t.state(), TransportState::Paused);
        t.advance_if_advancing(256);
        assert_eq!(t.position(), 512, "paused state must not advance");
    }

    #[test]
    fn recording_state_auto_advances_position() {
        // Recording shares Playing's advance semantics (real
        // recording gating lands with punch region in 3G+).
        let mut t = Transport::new();
        t.state = TransportState::Recording;
        t.advance_if_advancing(128);
        assert_eq!(t.position(), 128);
    }

    #[test]
    fn scrubbing_state_does_not_auto_advance() {
        // 3G regression: Scrubbing is a user-driven mode; the
        // audio callback must NOT advance the playhead during
        // scrub. Only explicit `scrub(delta)` calls move it.
        let mut t = Transport::new();
        t.state = TransportState::Scrubbing;
        t.advance_if_advancing(128);
        assert_eq!(t.position(), 0, "scrub state must not auto-advance");
    }

    #[test]
    fn set_tempo_clamps_to_valid_range() {
        let mut t = Transport::new();
        t.set_tempo(200.0);
        assert_eq!(t.bpm(), 200.0);

        // Below min → clamped up.
        t.set_tempo(5.0);
        assert_eq!(t.bpm(), MIN_BPM);

        // Above max → clamped down.
        t.set_tempo(10_000.0);
        assert_eq!(t.bpm(), MAX_BPM);
    }

    #[test]
    fn set_tempo_rejects_nonfinite_input() {
        // NaN and infinities would poison every downstream beat/sample
        // calculation. Snap to default.
        let mut t = Transport::new();
        t.set_tempo(f32::NAN);
        assert_eq!(t.bpm(), DEFAULT_BPM);
        t.set_tempo(f32::INFINITY);
        assert_eq!(t.bpm(), DEFAULT_BPM);
        t.set_tempo(f32::NEG_INFINITY);
        assert_eq!(t.bpm(), DEFAULT_BPM);
    }

    #[test]
    fn shared_position_reflects_transport_advance() {
        let mut t = Transport::new();
        let shared = t.shared_position();
        t.play();
        t.advance_if_advancing(1024);
        assert_eq!(shared.get(), 1024);
        t.seek(999_999);
        assert_eq!(shared.get(), 999_999);
        t.stop();
        assert_eq!(shared.get(), 0, "stop rewind must be visible on shared counter");
    }

    #[test]
    fn shared_position_is_cheap_to_clone() {
        // Regression guard: SharedPosition must be an Arc-based handle,
        // not a copy of the counter. Clone must produce aliasing
        // handles that see the same writes.
        let p = SharedPosition::new();
        let p2 = p.clone();
        p.set(42);
        assert_eq!(p2.get(), 42, "clone must alias the original counter");
        p2.advance(8);
        assert_eq!(p.get(), 50);
    }

    #[test]
    fn advance_returns_new_position() {
        let p = SharedPosition::new();
        assert_eq!(p.advance(100), 100);
        assert_eq!(p.advance(50), 150);
    }

    #[test]
    fn transport_state_is_copy() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<TransportState>();
    }

    #[test]
    fn is_advancing_covers_play_record_only() {
        // 3G: Scrubbing is no longer an "advancing" state — the
        // user drives position explicitly via `scrub(delta)`, and
        // the audio callback does not auto-advance during scrub.
        assert!(!TransportState::Stopped.is_advancing());
        assert!(
            !TransportState::Paused.is_advancing(),
            "Paused must not advance — that is the whole point"
        );
        assert!(TransportState::Playing.is_advancing());
        assert!(TransportState::Recording.is_advancing());
        assert!(
            !TransportState::Scrubbing.is_advancing(),
            "Scrubbing is user-driven — must NOT auto-advance"
        );
    }

    // ── 3G: Scrub ────────────────────────────────────────────────────

    #[test]
    fn scrub_forward_moves_playhead_and_sets_state() {
        let mut t = Transport::new();
        t.seek(1000);
        t.scrub(500);
        assert_eq!(t.state(), TransportState::Scrubbing);
        assert_eq!(t.position(), 1500);
    }

    #[test]
    fn scrub_backward_moves_playhead_and_sets_state() {
        let mut t = Transport::new();
        t.seek(1000);
        t.scrub(-300);
        assert_eq!(t.state(), TransportState::Scrubbing);
        assert_eq!(t.position(), 700);
    }

    #[test]
    fn scrub_saturates_at_zero_on_large_negative_delta() {
        let mut t = Transport::new();
        t.seek(100);
        t.scrub(-10_000);
        assert_eq!(t.position(), 0, "scrub must not underflow to u64::MAX");
    }

    #[test]
    fn scrub_saturates_at_u64_max_on_large_positive_delta() {
        let mut t = Transport::new();
        t.seek(u64::MAX - 10);
        t.scrub(i64::MAX);
        assert_eq!(t.position(), u64::MAX, "scrub must not wrap on overflow");
    }

    #[test]
    fn scrub_from_playing_transitions_to_scrubbing() {
        let mut t = Transport::new();
        t.play();
        t.advance_if_advancing(1000);
        assert_eq!(t.state(), TransportState::Playing);
        t.scrub(500);
        assert_eq!(t.state(), TransportState::Scrubbing);
    }

    // ── 3G: Punch region integration ────────────────────────────────

    #[test]
    fn new_transport_has_disabled_punch_region() {
        let t = Transport::new();
        assert!(!t.punch_region_snapshot().is_active());
    }

    #[test]
    fn replace_punch_region_is_visible_via_snapshot_and_handle() {
        let mut t = Transport::new();
        let handle = t.punch_region_handle();
        let region = PunchRegion {
            enabled: true,
            start: 1000,
            end: 5000,
        };
        t.replace_punch_region(region);
        assert_eq!(t.punch_region_snapshot(), region);
        assert_eq!(**handle.load(), region);
    }

    // ── 3G: Count-in integration ────────────────────────────────────

    #[test]
    fn new_transport_has_disabled_count_in() {
        let t = Transport::new();
        assert!(!t.count_in_snapshot().enabled);
    }

    #[test]
    fn replace_count_in_is_visible_via_snapshot_and_handle() {
        let mut t = Transport::new();
        let handle = t.count_in_handle();
        let cfg = CountIn::new(true, 8);
        t.replace_count_in(cfg);
        assert_eq!(t.count_in_snapshot(), cfg);
        assert_eq!(**handle.load(), cfg);
    }

    #[test]
    fn bpm_bounds_are_sensible() {
        // Guard that downstream phases can trust the window.
        assert!(MIN_BPM > 0.0);
        assert!(MAX_BPM > MIN_BPM);
        assert!(DEFAULT_BPM > MIN_BPM && DEFAULT_BPM < MAX_BPM);
    }

    // ── 3B: tempo map + time-signature integration ──────────────────

    #[test]
    fn new_transport_starts_with_constant_default_tempo_map() {
        let t = Transport::new();
        let map = t.tempo_map_snapshot();
        assert_eq!(map.events().len(), 1);
        assert_eq!(map.events()[0].bpm, DEFAULT_BPM);
        assert_eq!(map.events()[0].at_sample, 0);
    }

    #[test]
    fn set_tempo_builds_single_event_map() {
        let mut t = Transport::new();
        t.set_tempo(140.0);
        let map = t.tempo_map_snapshot();
        assert_eq!(map.events().len(), 1);
        assert_eq!(map.events()[0].bpm, 140.0);
        assert_eq!(t.bpm(), 140.0);
    }

    #[test]
    fn replace_tempo_map_swaps_atomically() {
        use super::super::tempo_map::{TempoEvent, TempoMap};
        let mut t = Transport::new();
        let new_map = TempoMap::try_new(vec![
            TempoEvent::new(0, 100.0),
            TempoEvent::new(48_000, 160.0),
        ])
        .unwrap();
        t.replace_tempo_map(new_map);
        let snapshot = t.tempo_map_snapshot();
        assert_eq!(snapshot.events().len(), 2);
        // BPM at position 0 reads the first segment.
        assert_eq!(t.bpm(), 100.0);
        // Seeking into the second segment should flip the BPM reading.
        t.seek(48_000);
        assert_eq!(t.bpm(), 160.0);
    }

    #[test]
    fn tempo_map_handle_aliases_transport_cell() {
        // Regression guard: `tempo_map_handle` must return a handle
        // to the SAME `ArcSwap` the transport uses, so downstream
        // consumers (main-thread readers, UI polling) see the audio
        // thread's writes without a second subscription path.
        use super::super::tempo_map::TempoMap;
        let mut t = Transport::new();
        let handle = t.tempo_map_handle();
        assert_eq!(handle.load().bpm_at(0), DEFAULT_BPM);
        t.set_tempo(99.0);
        assert_eq!(
            handle.load().bpm_at(0),
            99.0,
            "handle must observe transport-side updates"
        );
        // And the other way — external swaps reach the transport.
        handle.store(Arc::new(TempoMap::new_constant(77.0)));
        assert_eq!(t.bpm(), 77.0);
    }

    #[test]
    fn time_sig_map_handle_aliases_transport_cell() {
        use super::super::time_sig_map::TimeSignatureMap;
        let mut t = Transport::new();
        let handle = t.time_sig_map_handle();
        assert_eq!(handle.load().signature_at(0), (4, 4));
        t.replace_time_signature_map(TimeSignatureMap::new_constant(3, 4));
        assert_eq!(
            handle.load().signature_at(0),
            (3, 4),
            "handle must observe transport-side updates"
        );
    }

    // ── 3C: loop region integration ─────────────────────────────────

    #[test]
    fn new_transport_has_disabled_loop_region() {
        let t = Transport::new();
        let r = t.loop_region_snapshot();
        assert_eq!(r, LoopRegion::disabled());
        assert!(!r.is_active());
    }

    #[test]
    fn replace_loop_region_is_visible_on_snapshot_and_handle() {
        let mut t = Transport::new();
        let handle = t.loop_region_handle();

        let region = LoopRegion {
            enabled: true,
            start: 48_000,
            end: 96_000,
        };
        t.replace_loop_region(region);

        assert_eq!(t.loop_region_snapshot(), region);
        // The external handle must observe the same cell.
        let via_handle = **handle.load();
        assert_eq!(via_handle, region);
    }

    #[test]
    fn advance_with_loop_no_op_when_stopped() {
        let mut t = Transport::new();
        t.replace_loop_region(LoopRegion {
            enabled: true,
            start: 0,
            end: 100,
        });
        t.advance_with_loop_if_advancing(50);
        assert_eq!(t.position(), 0, "stopped transport must not advance");
    }

    #[test]
    fn advance_with_loop_wraps_at_end_boundary() {
        let mut t = Transport::new();
        t.replace_loop_region(LoopRegion {
            enabled: true,
            start: 48_000,
            end: 96_000,
        });
        t.seek(95_900);
        t.play();
        // Advance 256 → raw 96_156; over = 156 → start + 156 = 48_156.
        t.advance_with_loop_if_advancing(256);
        assert_eq!(t.position(), 48_156);
    }

    #[test]
    fn advance_with_loop_no_wrap_when_region_disabled() {
        let mut t = Transport::new();
        // Region set but disabled.
        t.replace_loop_region(LoopRegion {
            enabled: false,
            start: 0,
            end: 1_000,
        });
        t.seek(900);
        t.play();
        t.advance_with_loop_if_advancing(256);
        assert_eq!(
            t.position(),
            1_156,
            "disabled loop must not wrap — position advances past end"
        );
    }

    #[test]
    fn advance_with_loop_no_wrap_when_outside_loop() {
        let mut t = Transport::new();
        t.replace_loop_region(LoopRegion {
            enabled: true,
            start: 0,
            end: 1_000,
        });
        // Seek past end → outside the loop.
        t.seek(5_000);
        t.play();
        t.advance_with_loop_if_advancing(256);
        assert_eq!(
            t.position(),
            5_256,
            "playhead past end → no wrap, just advance"
        );
    }

    #[test]
    fn advance_with_loop_reads_latest_region_each_buffer() {
        // The audio callback loads the ArcSwap on every buffer, so a
        // main-thread mutation mid-playback must take effect
        // immediately.
        let mut t = Transport::new();
        t.seek(500);
        t.play();

        // No wrap yet — no region set.
        t.advance_with_loop_if_advancing(100);
        assert_eq!(t.position(), 600);

        // Now install a loop that the next advance will cross.
        t.replace_loop_region(LoopRegion {
            enabled: true,
            start: 100,
            end: 700,
        });
        t.advance_with_loop_if_advancing(200);
        // 600 + 200 = 800; over = 100; 100 + (100 % 600) = 200.
        assert_eq!(t.position(), 200);
    }
}
