//! ACE DSP Core — Pure audio DSP algorithms
//!
//! This crate provides zero-dependency DSP primitives designed for real-time
//! audio processing. All algorithms are suitable for AudioWorklet (no heap
//! allocation in hot paths, no std requirement).

#![cfg_attr(not(feature = "std"), no_std)]

pub mod biquad;
pub mod delay;
pub mod distortion;
pub mod dynamics;
pub mod eq;
pub mod lfo;
pub mod limiter;
pub mod modulation;
pub mod reverb;
pub mod stft;
pub mod timestretch;

/// Anti-denormal constant: add to feedback loops to prevent denormal floats.
/// Denormals cause 10-100x CPU slowdown on x86/ARM when present in feedback.
pub const ANTI_DENORMAL: f64 = 1e-18;

/// Default sample rate for the DAW engine.
pub const DEFAULT_SAMPLE_RATE: f32 = 48_000.0;

/// Smoke-test function — verifies the WASM pipeline end-to-end.
/// Remove once real DSP modules are wired up.
#[inline]
pub fn add(a: f32, b: f32) -> f32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_add() {
        assert_eq!(add(2.0, 3.0), 5.0);
    }
}
