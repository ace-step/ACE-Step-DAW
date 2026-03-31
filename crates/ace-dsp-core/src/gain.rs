//! Gain processor — simplest possible effect for pipeline validation.

/// A simple gain processor that applies a multiplier to audio samples.
/// Used as the first WASM effect to validate the entire pipeline.
pub struct GainProcessor {
    gain: f32,
}

impl GainProcessor {
    pub fn new(gain: f32) -> Self {
        Self { gain }
    }

    pub fn set_gain(&mut self, gain: f32) {
        self.gain = gain;
    }

    pub fn gain(&self) -> f32 {
        self.gain
    }

    /// Process a mono buffer in-place.
    #[inline]
    pub fn process_mono(&self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample *= self.gain;
        }
    }

    /// Process interleaved stereo buffer in-place.
    /// Samples are arranged as [L, R, L, R, ...].
    #[inline]
    pub fn process_stereo_interleaved(&self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample *= self.gain;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gain_processor_new() {
        let proc = GainProcessor::new(0.75);
        assert_eq!(proc.gain(), 0.75);
    }

    #[test]
    fn test_gain_processor_set_gain() {
        let mut proc = GainProcessor::new(1.0);
        proc.set_gain(0.5);
        assert_eq!(proc.gain(), 0.5);
    }

    #[test]
    fn test_process_mono() {
        let proc = GainProcessor::new(0.5);
        let mut buf = [1.0_f32, -1.0, 0.5, 0.0];
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, -0.5, 0.25, 0.0]);
    }

    #[test]
    fn test_process_stereo_interleaved() {
        let proc = GainProcessor::new(2.0);
        let mut buf = [0.25_f32, -0.25, 0.5, -0.5]; // L R L R
        proc.process_stereo_interleaved(&mut buf);
        assert_eq!(buf, [0.5, -0.5, 1.0, -1.0]);
    }
}
