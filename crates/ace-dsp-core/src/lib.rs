//! ACE-Step DSP Core — Pure DSP algorithms (no_std compatible)
//!
//! This crate contains the audio processing primitives used by ACE-Step-DAW.
//! All algorithms are zero-allocation in the hot path and designed for
//! real-time audio processing.

#![cfg_attr(not(feature = "std"), no_std)]

pub mod autopan;
pub mod biquad;
#[cfg(feature = "std")]
pub mod chorus;
pub mod dcblock;
#[cfg(feature = "std")]
pub mod delay;
pub mod distortion;
#[cfg(feature = "std")]
pub mod dynamics;
pub mod eq;
pub mod gain;
pub mod lfo;
#[cfg(feature = "std")]
pub mod limiter;
// NOTE: modulation.rs (from main) depends on BiquadMono/FilterType API which
// differs from our biquad implementation. Temporarily excluded until APIs are unified.
// pub mod modulation;
pub mod phaser;
#[cfg(feature = "std")]
pub mod reverb;
pub mod ringmod;
// NOTE: stft.rs and timestretch.rs (from main) will be re-enabled when integrated.
// pub mod stft;
pub mod stereo;
// pub mod timestretch;
pub mod tremolo;

/// Anti-denormal guard constant.
/// Add/subtract in feedback paths to prevent denormalized floats.
pub const ANTI_DENORMAL: f32 = 1e-18;

/// Default sample rate for the DAW engine.
pub const DEFAULT_SAMPLE_RATE: f32 = 48_000.0;

/// Process a stereo buffer in-place with a gain multiplier.
#[inline]
pub fn apply_gain_stereo(left: &mut [f32], right: &mut [f32], gain: f32) {
    debug_assert_eq!(left.len(), right.len());
    for (l, r) in left.iter_mut().zip(right.iter_mut()) {
        *l *= gain;
        *r *= gain;
    }
}

/// Pass-through: copy input to output unchanged.
#[inline]
pub fn pass_through(input: &[f32], output: &mut [f32]) {
    let len = input.len().min(output.len());
    output[..len].copy_from_slice(&input[..len]);
}

/// Smoke-test function — verifies the WASM pipeline end-to-end.
#[inline]
pub fn add(a: f32, b: f32) -> f32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_gain_stereo() {
        let mut left = [1.0_f32, 0.5, -0.25, 0.0];
        let mut right = [0.0_f32, -1.0, 0.75, 0.125];
        apply_gain_stereo(&mut left, &mut right, 0.5);
        assert_eq!(left, [0.5, 0.25, -0.125, 0.0]);
        assert_eq!(right, [0.0, -0.5, 0.375, 0.0625]);
    }

    #[test]
    fn test_pass_through() {
        let input = [0.1_f32, 0.2, 0.3, 0.4];
        let mut output = [0.0_f32; 4];
        pass_through(&input, &mut output);
        assert_eq!(output, input);
    }

    #[test]
    fn smoke_add() {
        assert_eq!(add(2.0, 3.0), 5.0);
    }
}
