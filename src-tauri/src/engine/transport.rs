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
//! - `Ordering::Relaxed` is sufficient for both sides: the position is
//!   monotonic within a Playing run (audio callback only increments it),
//!   and a single-producer / multi-consumer counter does not need
//!   ordering relative to other memory operations. This matches the
//!   existing meter pattern in `meter_bank.rs`.
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

/// Transport state machine — mirrors the four modes every classic DAW
/// transport exposes. Flat `Copy` so commands can carry it without
/// allocation; `PartialEq` so tests can assert exact values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportState {
    /// Transport is at rest. Position does not advance. Audio callback
    /// still runs (to honor any active test signals / metering), but no
    /// scheduled content is rendered.
    Stopped,
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
    /// Whether the callback should advance the sample counter.
    #[inline]
    pub fn is_advancing(self) -> bool {
        matches!(
            self,
            TransportState::Playing | TransportState::Recording | TransportState::Scrubbing
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
#[derive(Debug, Clone)]
pub struct Transport {
    state: TransportState,
    /// Monotonically-advancing sample counter (shared with the UI).
    position: SharedPosition,
    /// Single BPM (tempo map lands in 3B).
    bpm: f32,
}

impl Transport {
    /// Fresh transport: Stopped at sample 0, 120 BPM.
    pub fn new() -> Self {
        Self {
            state: TransportState::Stopped,
            position: SharedPosition::new(),
            bpm: DEFAULT_BPM,
        }
    }

    pub fn state(&self) -> TransportState {
        self.state
    }

    pub fn position(&self) -> u64 {
        self.position.get()
    }

    pub fn bpm(&self) -> f32 {
        self.bpm
    }

    /// Hand out a clone of the shared position counter so external
    /// readers (UI poller, Tauri command) can snapshot it without
    /// going through the command queue.
    pub fn shared_position(&self) -> SharedPosition {
        self.position.clone()
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
    pub fn pause(&mut self) {
        self.state = TransportState::Stopped;
    }

    /// Jump to an absolute sample position. Does not change the state.
    pub fn seek(&mut self, sample: u64) {
        self.position.set(sample);
    }

    /// Set the tempo. Clamped to [`MIN_BPM`] ..= [`MAX_BPM`] and to
    /// finite values — NaN or ±∞ are silently snapped to
    /// [`DEFAULT_BPM`] so the audio thread never sees a poisoned tempo.
    pub fn set_tempo(&mut self, bpm: f32) {
        let safe = if bpm.is_finite() {
            bpm.clamp(MIN_BPM, MAX_BPM)
        } else {
            DEFAULT_BPM
        };
        self.bpm = safe;
    }

    /// Called by the audio callback once per buffer. Advances the
    /// position if the transport is advancing; otherwise no-ops.
    #[inline]
    pub fn advance_if_playing(&mut self, frames: u64) {
        if self.state.is_advancing() {
            self.position.advance(frames);
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
    fn pause_preserves_position() {
        let mut t = Transport::new();
        t.seek(96_000);
        t.play();
        t.pause();
        assert_eq!(t.state(), TransportState::Stopped);
        assert_eq!(
            t.position(),
            96_000,
            "pause must leave the position counter intact"
        );
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
        t.advance_if_playing(256);
        assert_eq!(t.position(), 0);

        // Playing: advance.
        t.play();
        t.advance_if_playing(256);
        t.advance_if_playing(256);
        assert_eq!(t.position(), 512);

        // Pause: advance stops.
        t.pause();
        t.advance_if_playing(256);
        assert_eq!(t.position(), 512, "paused state must not advance");
    }

    #[test]
    fn recording_and_scrubbing_states_advance_position() {
        // Recording and Scrubbing share Playing's advance semantics in
        // 3A — true record/scrub behavior lands in later phases, but
        // they must not freeze the timeline.
        let mut t = Transport::new();
        t.state = TransportState::Recording;
        t.advance_if_playing(128);
        assert_eq!(t.position(), 128);

        t.state = TransportState::Scrubbing;
        t.advance_if_playing(128);
        assert_eq!(t.position(), 256);
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
        t.advance_if_playing(1024);
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
    fn is_advancing_covers_play_record_scrub_but_not_stop() {
        assert!(!TransportState::Stopped.is_advancing());
        assert!(TransportState::Playing.is_advancing());
        assert!(TransportState::Recording.is_advancing());
        assert!(TransportState::Scrubbing.is_advancing());
    }

    #[test]
    fn bpm_bounds_are_sensible() {
        // Guard that downstream phases can trust the window.
        assert!(MIN_BPM > 0.0);
        assert!(MAX_BPM > MIN_BPM);
        assert!(DEFAULT_BPM > MIN_BPM && DEFAULT_BPM < MAX_BPM);
    }
}
