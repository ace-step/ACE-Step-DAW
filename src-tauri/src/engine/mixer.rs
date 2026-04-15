//! Pure DSP math for the mixer — pan law + audibility resolution.
//!
//! These are stateless, allocation-free functions safe to call from the
//! audio thread. The audio callback in 2B-1c will invoke them per
//! sample or per buffer; for now they are unit-testable in isolation.

use super::graph::Track;

/// Equal-power sin/cos pan law.
///
/// Given `pan ∈ [-1.0, 1.0]`, returns `(left_gain, right_gain)`. Out of
/// range input is clamped.
///
/// # Convention
///
/// - `-1.0` → `(1.0, 0.0)` (hard left)
/// - ` 0.0` → `(≈0.7071, ≈0.7071)` (center, -3 dB per channel)
/// - `+1.0` → `(0.0, 1.0)` (hard right)
///
/// The -3 dB center dip is the de facto standard for digital mixing
/// consoles (Logic, Cubase, Pro Tools default). It preserves perceived
/// loudness as a mono source pans from the mono-sum point to either
/// extreme — a linear pan law sounds "louder in the middle" because
/// phantom center doubles the power, which is almost never what the
/// user wants.
#[inline]
pub fn equal_power_pan(pan: f32) -> (f32, f32) {
    let clamped = if pan < -1.0 {
        -1.0
    } else if pan > 1.0 {
        1.0
    } else {
        pan
    };
    let theta = (clamped + 1.0) * std::f32::consts::FRAC_PI_4;
    (theta.cos(), theta.sin())
}

/// Resolve whether a track is audible given the current global solo
/// state.
///
/// # Convention (matches every major DAW)
///
/// - **Mute ≻ solo**: a track that is both muted *and* soloed is silent.
///   Ableton, Logic, Pro Tools, Cubase, Bitwig all agree on this. A
///   user who has muted a track has made an explicit "silence this"
///   decision that solo must not override.
/// - When `any_solo` is true, non-soloed tracks are silent.
/// - Unoccupied slots are always silent — this guards against stale
///   mute/solo flags on freed slots.
#[inline]
pub fn is_audible(track: &Track, any_solo: bool) -> bool {
    track.occupied && !track.mute && (!any_solo || track.solo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::FRAC_1_SQRT_2;

    fn close(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-5
    }

    #[test]
    fn pan_center_is_minus_three_db_on_both_channels() {
        let (l, r) = equal_power_pan(0.0);
        assert!(close(l, FRAC_1_SQRT_2), "left {l} ≠ 1/√2");
        assert!(close(r, FRAC_1_SQRT_2), "right {r} ≠ 1/√2");
        // Power sums to unity: L² + R² = 1
        assert!(close(l * l + r * r, 1.0));
    }

    #[test]
    fn pan_hard_left_sends_all_to_left_channel() {
        let (l, r) = equal_power_pan(-1.0);
        assert!(close(l, 1.0), "left {l} ≠ 1");
        assert!(close(r, 0.0), "right {r} ≠ 0");
    }

    #[test]
    fn pan_hard_right_sends_all_to_right_channel() {
        let (l, r) = equal_power_pan(1.0);
        assert!(close(l, 0.0), "left {l} ≠ 0");
        assert!(close(r, 1.0), "right {r} ≠ 1");
    }

    #[test]
    fn pan_is_monotonic_across_range() {
        // Left gain strictly decreases from 1.0 → 0.0 as pan goes -1 → +1.
        // Right gain strictly increases symmetrically.
        let mut prev_l = f32::INFINITY;
        let mut prev_r = f32::NEG_INFINITY;
        for i in -10..=10 {
            let pan = i as f32 / 10.0;
            let (l, r) = equal_power_pan(pan);
            assert!(l <= prev_l, "pan {pan}: left {l} not ≤ prev {prev_l}");
            assert!(r >= prev_r, "pan {pan}: right {r} not ≥ prev {prev_r}");
            prev_l = l;
            prev_r = r;
        }
    }

    #[test]
    fn pan_conserves_power_at_every_position() {
        // Equal-power property: L² + R² ≈ 1 for all pan values.
        for i in -100..=100 {
            let pan = i as f32 / 100.0;
            let (l, r) = equal_power_pan(pan);
            let power = l * l + r * r;
            assert!(
                (power - 1.0).abs() < 1e-5,
                "pan {pan}: power {power} ≠ 1"
            );
        }
    }

    #[test]
    fn pan_clamps_out_of_range_input() {
        assert_eq!(equal_power_pan(-2.0), equal_power_pan(-1.0));
        assert_eq!(equal_power_pan(1.5), equal_power_pan(1.0));
        assert_eq!(equal_power_pan(f32::NEG_INFINITY), equal_power_pan(-1.0));
        assert_eq!(equal_power_pan(f32::INFINITY), equal_power_pan(1.0));
    }

    // ── audibility ──────────────────────────────────────────────────

    fn occupied_track() -> Track {
        Track {
            occupied: true,
            ..Track::default()
        }
    }

    #[test]
    fn unoccupied_is_never_audible() {
        let t = Track::default();
        assert!(!is_audible(&t, false));
        assert!(!is_audible(&t, true));
    }

    #[test]
    fn plain_occupied_track_is_audible_without_solo() {
        assert!(is_audible(&occupied_track(), false));
    }

    #[test]
    fn muted_track_is_silent_even_without_solo() {
        let t = Track {
            mute: true,
            ..occupied_track()
        };
        assert!(!is_audible(&t, false));
    }

    #[test]
    fn non_soloed_track_is_silent_when_any_solo_active() {
        assert!(!is_audible(&occupied_track(), true));
    }

    #[test]
    fn soloed_track_is_audible_when_any_solo_active() {
        let t = Track {
            solo: true,
            ..occupied_track()
        };
        assert!(is_audible(&t, true));
    }

    #[test]
    fn mute_beats_solo_convention() {
        // Regression guard for the "mute ≻ solo" convention: a track
        // that is both muted and soloed must be silent. Every major DAW
        // does this; flipping the precedence breaks user expectations.
        let t = Track {
            mute: true,
            solo: true,
            ..occupied_track()
        };
        assert!(!is_audible(&t, true));
        assert!(!is_audible(&t, false));
    }
}
