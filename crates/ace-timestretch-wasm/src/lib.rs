use wasm_bindgen::prelude::*;
use ace_timestretch::{StretchEngine, StretchParams, StretchQuality};

/// Stretch audio offline at standard quality.
/// Returns a new Float32Array with the stretched samples.
#[wasm_bindgen]
pub fn stretch_standard(input: &[f32], sample_rate: u32, factor: f64) -> Vec<f32> {
    ace_timestretch::stretch_offline(input, sample_rate, factor, StretchQuality::Standard)
}

/// Stretch audio offline at highest quality (transient-aware).
/// Returns a new Float32Array with the stretched samples.
#[wasm_bindgen]
pub fn stretch_high(input: &[f32], sample_rate: u32, factor: f64) -> Vec<f32> {
    ace_timestretch::stretch_offline(input, sample_rate, factor, StretchQuality::High)
}

/// Pitch shift audio by the given number of semitones.
/// Duration is preserved.
#[wasm_bindgen]
pub fn pitch_shift_wasm(input: &[f32], sample_rate: u32, semitones: f64) -> Vec<f32> {
    ace_timestretch::pitch_shift(input, sample_rate, semitones)
}

/// Real-time stretch engine for use in AudioWorklet.
#[wasm_bindgen]
pub struct RealtimeStretcher {
    engine: StretchEngine,
}

#[wasm_bindgen]
impl RealtimeStretcher {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> Self {
        Self {
            engine: StretchEngine::new(StretchParams {
                sample_rate,
                quality: StretchQuality::Realtime,
                ..Default::default()
            }),
        }
    }

    /// Set the stretch factor (0.1–8.0). 1.0 = no change.
    pub fn set_factor(&mut self, factor: f64) {
        self.engine.set_stretch_factor(factor);
    }

    /// Process a block of input samples and return stretched output.
    /// Call this from AudioWorklet's process() method.
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        self.engine.process_block(input)
    }

    /// Reset internal state (call when seeking or changing tracks).
    pub fn reset(&mut self) {
        self.engine.reset();
    }
}
