//! Punch region — the `[start, end)` sample range that defines
//! where recording is armed.
//!
//! For 3G this is **state-only**: the audio callback does not
//! consult the punch region at all. The Rust engine simply holds
//! the configured range and exposes it to the UI so the record
//! button can visually indicate the punch window. When recording
//! lands (future phase) the engine will gate track-input capture
//! on `punch_region.is_active()` and the playhead being inside.
//!
//! Deliberately separate from [`super::loop_region::LoopRegion`]
//! because the two have different semantics: the loop wraps the
//! playhead, the punch gates recording. Users commonly want them
//! at different sample ranges (loop a 4-bar phrase, punch only
//! bar 3).

use serde::{Deserialize, Serialize};

/// Punch range. Half-open interval `[start, end)`; invalid ranges
/// (`end <= start`) are silently treated as disabled to tolerate
/// UI drag states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PunchRegion {
    pub enabled: bool,
    pub start: u64,
    pub end: u64,
}

impl PunchRegion {
    pub const fn disabled() -> Self {
        Self {
            enabled: false,
            start: 0,
            end: 0,
        }
    }

    /// True iff `enabled` and the range is non-empty.
    #[inline]
    pub fn is_active(&self) -> bool {
        self.enabled && self.end > self.start
    }

    #[inline]
    pub fn length(&self) -> u64 {
        if self.is_active() {
            self.end - self.start
        } else {
            0
        }
    }

    /// Whether `sample` falls inside the active punch window.
    /// Returns `false` for disabled or malformed regions.
    #[inline]
    pub fn contains(&self, sample: u64) -> bool {
        self.is_active() && sample >= self.start && sample < self.end
    }
}

impl Default for PunchRegion {
    fn default() -> Self {
        Self::disabled()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_disabled() {
        let p = PunchRegion::default();
        assert!(!p.is_active());
        assert_eq!(p.length(), 0);
        assert!(!p.contains(50));
    }

    #[test]
    fn is_active_requires_enabled_and_non_empty() {
        assert!(!PunchRegion { enabled: false, start: 0, end: 100 }.is_active());
        assert!(!PunchRegion { enabled: true, start: 100, end: 100 }.is_active());
        assert!(!PunchRegion { enabled: true, start: 200, end: 100 }.is_active());
        assert!(PunchRegion { enabled: true, start: 0, end: 100 }.is_active());
    }

    #[test]
    fn contains_is_half_open_inclusive_on_start_exclusive_on_end() {
        let p = PunchRegion { enabled: true, start: 100, end: 200 };
        assert!(!p.contains(99));
        assert!(p.contains(100));
        assert!(p.contains(199));
        assert!(!p.contains(200));
        assert!(!p.contains(201));
    }

    #[test]
    fn contains_false_for_disabled() {
        let p = PunchRegion { enabled: false, start: 100, end: 200 };
        assert!(!p.contains(150));
    }

    #[test]
    fn serde_round_trip_preserves_fields() {
        let p = PunchRegion { enabled: true, start: 48_000, end: 96_000 };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"enabled\":true"));
        assert!(json.contains("\"start\":48000"));
        assert!(json.contains("\"end\":96000"));
        let back: PunchRegion = serde_json::from_str(&json).unwrap();
        assert_eq!(back, p);
    }

    #[test]
    fn type_is_copy_and_small() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<PunchRegion>();
        assert!(std::mem::size_of::<PunchRegion>() <= 32);
    }
}
