//! ACE-Step DSP Core — Pure DSP algorithms (no_std compatible)
//!
//! This crate contains the audio processing primitives used by ACE-Step-DAW.
//! All algorithms are zero-allocation in the hot path and designed for
//! real-time audio processing.

#![cfg_attr(not(feature = "std"), no_std)]

pub mod biquad;
#[cfg(feature = "std")]
pub mod chorus;
#[cfg(feature = "std")]
pub mod delay;
pub mod distortion;
#[cfg(feature = "std")]
pub mod dynamics;
pub mod eq;
pub mod gain;
#[cfg(feature = "std")]
pub mod limiter;
#[cfg(feature = "std")]
pub mod reverb;
pub mod stereo;

/// Anti-denormal guard constant.
/// Add/subtract in feedback paths to prevent denormalized floats.
pub const ANTI_DENORMAL: f32 = 1e-18;

/// Process a stereo buffer in-place with a gain multiplier.
/// This is the simplest possible DSP operation — used to verify
/// the WASM pipeline works end-to-end.
#[inline]
pub fn apply_gain_stereo(left: &mut [f32], right: &mut [f32], gain: f32) {
    debug_assert_eq!(left.len(), right.len());
    for (l, r) in left.iter_mut().zip(right.iter_mut()) {
        *l *= gain;
        *r *= gain;
    }
}

/// Pass-through: copy input to output unchanged.
/// Used as a no-op effect to verify the AudioWorklet ↔ WASM bridge.
#[inline]
pub fn pass_through(input: &[f32], output: &mut [f32]) {
    let len = input.len().min(output.len());
    output[..len].copy_from_slice(&input[..len]);
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
    fn test_apply_gain_stereo_unity() {
        let mut left = [1.0_f32, -1.0];
        let mut right = [0.5_f32, -0.5];
        apply_gain_stereo(&mut left, &mut right, 1.0);
        assert_eq!(left, [1.0, -1.0]);
        assert_eq!(right, [0.5, -0.5]);
    }

    #[test]
    fn test_apply_gain_stereo_silence() {
        let mut left = [1.0_f32, -1.0];
        let mut right = [0.5_f32, -0.5];
        apply_gain_stereo(&mut left, &mut right, 0.0);
        assert_eq!(left, [0.0, 0.0]);
        assert_eq!(right, [0.0, 0.0]);
    }

    #[test]
    fn test_pass_through() {
        let input = [0.1_f32, 0.2, 0.3, 0.4];
        let mut output = [0.0_f32; 4];
        pass_through(&input, &mut output);
        assert_eq!(output, input);
    }

    #[test]
    fn test_pass_through_different_lengths() {
        let input = [1.0_f32, 2.0, 3.0];
        let mut output = [0.0_f32; 5];
        pass_through(&input, &mut output);
        assert_eq!(&output[..3], &input[..]);
        assert_eq!(&output[3..], &[0.0, 0.0]);
    }
}
