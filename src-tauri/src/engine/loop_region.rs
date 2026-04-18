//! Loop region — the `[start, end)` sample range the transport
//! wraps around when playback reaches the end boundary.
//!
//! # Why its own module?
//!
//! Loop state is small (3 fields) but interacts with every advancing
//! state (`Playing`, `Recording`, `Scrubbing`) and is read on the hot
//! path of every audio callback. Keeping it in a dedicated module
//! with pure functions for the wrap math means the audio callback
//! can pass a `&LoopRegion` to a bounded-cost `Transport::advance*`
//! method — no branching on loop config inside the callback itself.
//!
//! # Invariants
//!
//! `LoopRegion` is a plain value type. Validity depends on the data:
//! - `enabled && end > start` → active loop.
//! - `enabled && end <= start` → the region is malformed; treated as
//!   disabled on the hot path (no wrap). This keeps the data schema
//!   tolerant of UI intermediate states (e.g. user dragging the end
//!   handle across the start handle) without surfacing a "your loop
//!   is invalid" error on every keystroke.
//! - `!enabled` → no wrap regardless of range.
//!
//! # Wrap semantics
//!
//! `end` is **exclusive** — sample position `end` is not played; the
//! transport wraps to `start` at that instant. This matches the
//! "region length" convention every major DAW uses: a 4-beat loop
//! covers samples `[0, 4 * samples_per_beat)`, and after `frames - 1`
//! advances the playhead is still inside the region.
//!
//! # Thread safety
//!
//! `LoopRegion` is `Copy + Send + Sync`. Shared between threads by
//! wrapping it in an `arc_swap::ArcSwap<LoopRegion>` at the call
//! site (see `transport.rs`), so this module only needs to provide
//! the pure math.

use serde::{Deserialize, Serialize};

/// The looping region of the transport.
///
/// `start` and `end` are absolute sample positions. When
/// [`enabled`] is true and `end > start`, the transport wraps the
/// playhead from `end` back to `start` on the sample immediately
/// after `end - 1` — i.e. the half-open interval `[start, end)`
/// is what actually plays.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRegion {
    pub enabled: bool,
    pub start: u64,
    pub end: u64,
}

impl LoopRegion {
    /// Disabled loop at position 0. Use as the default on engine
    /// startup — no wrap until the user sets a region.
    pub const fn disabled() -> Self {
        Self {
            enabled: false,
            start: 0,
            end: 0,
        }
    }

    /// Whether the loop should actually influence playback. Both
    /// `enabled` and a positive-length range must hold. Malformed
    /// ranges (`end <= start`) are silently treated as disabled so
    /// a UI intermediate state (user dragging the end handle
    /// through the start handle) does not panic or hang the engine.
    #[inline]
    pub fn is_active(&self) -> bool {
        self.enabled && self.end > self.start
    }

    /// Length of the active loop in samples. Returns 0 for a
    /// disabled or malformed region, so callers can use it as a
    /// divisor only after checking [`is_active`].
    #[inline]
    pub fn length(&self) -> u64 {
        if self.is_active() {
            self.end - self.start
        } else {
            0
        }
    }

    /// Compute the post-advance position when the transport moves
    /// from `current` by `frames`. If the advance crosses the loop
    /// end boundary, the result is wrapped into the loop by modulo.
    /// Otherwise the result is simply `current + frames` (saturating
    /// on u64 overflow).
    ///
    /// Pulled into its own pure function so that unit tests can
    /// cover every wrap case without needing a full `Transport`.
    ///
    /// # Edge cases
    ///
    /// - Loop inactive → return `current + frames` (saturating).
    /// - Playhead already at or past `end` → no wrap; just advance.
    /// - Playhead before `start` and advance crosses `end` →
    ///   wrap (the transport entered and exited the loop in one
    ///   buffer, so the wrap still applies).
    /// - `frames > length` (pathological: buffer larger than loop) →
    ///   modulo handles multiple wraps safely.
    ///
    /// # Overflow caveat
    ///
    /// `saturating_add` prevents a panic on `current + frames`
    /// overflow, but if `frames` is pathologically large (close to
    /// `u64::MAX`) the saturated raw value collapses distinct
    /// inputs onto the same sentinel, and the wrapped result can
    /// disagree with the "mathematically ideal" value by up to
    /// one loop length. Not reachable from the real audio callback,
    /// where `frames` is bounded by `max_frames = 4096` (see
    /// `audio_io.rs`). Found by codex review on PR #1713.
    #[inline]
    pub fn next_position(&self, current: u64, frames: u64) -> u64 {
        let raw = current.saturating_add(frames);
        if !self.is_active() {
            return raw;
        }
        // No wrap if the playhead is already past (or exactly at) the
        // end — the user sought out of the loop, so stay out.
        if current >= self.end {
            return raw;
        }
        // No wrap if the advance does not reach the end.
        if raw < self.end {
            return raw;
        }
        // Wrap: how far past end did we go?
        let over = raw - self.end;
        let len = self.end - self.start;
        // Modulo for pathological long advances — never return a
        // position outside the loop.
        self.start + (over % len)
    }
}

impl Default for LoopRegion {
    /// Default: disabled.
    fn default() -> Self {
        Self::disabled()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_disabled() {
        let l = LoopRegion::default();
        assert!(!l.enabled);
        assert_eq!(l.start, 0);
        assert_eq!(l.end, 0);
        assert!(!l.is_active());
        assert_eq!(l.length(), 0);
    }

    #[test]
    fn is_active_requires_enabled_and_non_empty() {
        assert!(!LoopRegion {
            enabled: false,
            start: 100,
            end: 200,
        }
        .is_active());
        assert!(!LoopRegion {
            enabled: true,
            start: 100,
            end: 100,
        }
        .is_active());
        assert!(!LoopRegion {
            enabled: true,
            start: 200,
            end: 100,
        }
        .is_active());
        assert!(LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        }
        .is_active());
    }

    #[test]
    fn length_returns_zero_for_inactive() {
        let disabled = LoopRegion {
            enabled: false,
            start: 100,
            end: 200,
        };
        assert_eq!(disabled.length(), 0);
        let empty = LoopRegion {
            enabled: true,
            start: 100,
            end: 100,
        };
        assert_eq!(empty.length(), 0);
    }

    #[test]
    fn length_for_active_loop() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        assert_eq!(l.length(), 100);
    }

    // ── next_position: inactive paths ────────────────────────────────

    #[test]
    fn next_position_no_wrap_when_disabled() {
        let l = LoopRegion {
            enabled: false,
            start: 100,
            end: 200,
        };
        assert_eq!(l.next_position(150, 100), 250);
    }

    #[test]
    fn next_position_no_wrap_when_empty_range() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 100,
        };
        assert_eq!(l.next_position(50, 100), 150);
    }

    #[test]
    fn next_position_no_wrap_when_inverted_range() {
        let l = LoopRegion {
            enabled: true,
            start: 200,
            end: 100,
        };
        assert_eq!(
            l.next_position(50, 100),
            150,
            "malformed region (start > end) must not wrap or panic"
        );
    }

    // ── next_position: outside loop paths ────────────────────────────

    #[test]
    fn next_position_no_wrap_when_playhead_past_end() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // Position already past end → user sought out of the loop.
        assert_eq!(l.next_position(250, 100), 350);
    }

    #[test]
    fn next_position_no_wrap_at_exact_end_already() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // At sample 200 we're AT end (already wrapped last time).
        // Advancing should not re-wrap — we're now outside.
        assert_eq!(l.next_position(200, 50), 250);
    }

    #[test]
    fn next_position_no_wrap_when_advance_stays_before_end() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        assert_eq!(l.next_position(150, 40), 190, "stays inside loop");
    }

    // ── next_position: wrap paths ────────────────────────────────────

    #[test]
    fn next_position_wraps_exactly_at_end_boundary() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // Advance lands exactly on end → wrap to start with 0 over.
        assert_eq!(
            l.next_position(150, 50),
            100,
            "raw result = end → wrap to start"
        );
    }

    #[test]
    fn next_position_wraps_mid_buffer() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // From 180 advance 50 → raw 230; over = 30 → start + 30 = 130.
        assert_eq!(l.next_position(180, 50), 130);
    }

    #[test]
    fn next_position_wraps_when_entering_from_before_start() {
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // From 50 advance 200 → raw 250; 50 < end (200), so wrap
        // applies. over = 50; 100 + (50 % 100) = 150.
        assert_eq!(l.next_position(50, 200), 150);
    }

    #[test]
    fn next_position_handles_multiple_wraps() {
        // Very short loop with a large advance — must wrap multiple
        // times without producing a position outside the loop.
        let l = LoopRegion {
            enabled: true,
            start: 0,
            end: 10,
        };
        // Advance 27 samples from 0: that's 2 full loops + 7 into
        // the third → position 7.
        let r = l.next_position(0, 27);
        assert!(r >= l.start && r < l.end, "{} not in [0,10)", r);
        assert_eq!(r, 7);
    }

    #[test]
    fn next_position_saturates_on_overflow_when_inactive() {
        let l = LoopRegion::disabled();
        assert_eq!(l.next_position(u64::MAX - 10, 50), u64::MAX);
    }

    // ── Codex review regression: frames = 0 / length = 1 ────────────

    #[test]
    fn next_position_zero_frames_is_no_op_in_all_regimes() {
        // Audio callback may deliver a zero-frame buffer on device
        // resync; the advance must be a pure no-op regardless of
        // loop state.
        let disabled = LoopRegion::disabled();
        assert_eq!(disabled.next_position(123, 0), 123);

        let active = LoopRegion {
            enabled: true,
            start: 100,
            end: 200,
        };
        // Inside the loop.
        assert_eq!(active.next_position(150, 0), 150);
        // Before the loop.
        assert_eq!(active.next_position(50, 0), 50);
        // At the end boundary — still no advance, stays AT end.
        assert_eq!(active.next_position(200, 0), 200);
        // Past the end.
        assert_eq!(active.next_position(250, 0), 250);
    }

    #[test]
    fn next_position_loop_length_one_holds_cursor_on_single_sample() {
        // Degenerate but valid region: [100, 101) — exactly one
        // sample in the loop. The wrap math must collapse every
        // advance back to `start`.
        let l = LoopRegion {
            enabled: true,
            start: 100,
            end: 101,
        };
        assert_eq!(l.length(), 1);
        // Advance from inside the single sample → wrap to start.
        assert_eq!(l.next_position(100, 1), 100, "advance of 1 wraps to start");
        assert_eq!(l.next_position(100, 2), 100, "advance of 2 still lands on start (over % 1 == 0)");
        assert_eq!(
            l.next_position(100, 1000),
            100,
            "large advance modulo-wraps to start"
        );
    }

    #[test]
    fn next_position_wraps_cleanly_at_large_loop() {
        let l = LoopRegion {
            enabled: true,
            start: 48_000,
            end: 96_000,
        };
        // 1 second at 48 kHz loop. From inside at 95_900, advance 256
        // frames → raw 96_156; over 156 → 48_156.
        assert_eq!(l.next_position(95_900, 256), 48_156);
    }

    // ── serde wire format ────────────────────────────────────────────

    #[test]
    fn serde_round_trip_preserves_fields() {
        let l = LoopRegion {
            enabled: true,
            start: 48_000,
            end: 96_000,
        };
        let json = serde_json::to_string(&l).unwrap();
        assert!(json.contains("\"enabled\":true"), "json: {json}");
        assert!(json.contains("\"start\":48000"));
        assert!(json.contains("\"end\":96000"));
        let back: LoopRegion = serde_json::from_str(&json).unwrap();
        assert_eq!(back, l);
    }

    #[test]
    fn loop_region_is_copy_and_small() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<LoopRegion>();
        // bool + u64 + u64 = 17 bytes, typically padded to 24.
        assert!(std::mem::size_of::<LoopRegion>() <= 32);
    }
}
