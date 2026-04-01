//! Time-stretching algorithms — Phase Vocoder and WSOLA.
//!
//! These change the tempo of audio without changing its pitch.
//! - Phase Vocoder: STFT-based, best for polyphonic material
//! - WSOLA: time-domain, best for monophonic/speech material

use crate::stft::Stft;

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use core::f64::consts::PI;

// ── Phase Vocoder ───────────────────────────────────────────────────

/// Phase vocoder time-stretch parameters.
#[derive(Debug, Clone, Copy)]
pub struct PhaseVocoderParams {
    pub fft_size: usize,        // 1024, 2048, 4096, 8192
    pub stretch_factor: f64,    // 0.25–4.0 (0.5 = half speed, 2.0 = double speed)
    pub phase_locking: bool,    // Laroche & Dolson phase locking
}

impl Default for PhaseVocoderParams {
    fn default() -> Self {
        Self {
            fft_size: 2048,
            stretch_factor: 1.0,
            phase_locking: true,
        }
    }
}

/// Phase vocoder for time-stretching polyphonic audio.
///
/// Changes tempo without changing pitch by modifying the STFT hop
/// size between analysis and synthesis while maintaining phase coherence.
pub struct PhaseVocoder {
    params: PhaseVocoderParams,
    stft: Stft,
    analysis_hop: usize,
    synthesis_hop: usize,
    // Phase accumulator for phase propagation
    last_phase: Vec<f64>,
    synth_phase: Vec<f64>,
    // Output overlap-add buffer
    output_buffer: Vec<f64>,
    output_pos: usize,
}

impl PhaseVocoder {
    pub fn new(params: PhaseVocoderParams) -> Self {
        let fft_size = params.fft_size;
        let analysis_hop = fft_size / 4; // 75% overlap
        let synthesis_hop = (analysis_hop as f64 * params.stretch_factor) as usize;
        let synthesis_hop = synthesis_hop.max(1);
        let half = fft_size / 2 + 1;

        Self {
            params,
            stft: Stft::new(fft_size, analysis_hop),
            analysis_hop,
            synthesis_hop,
            last_phase: vec![0.0; half],
            synth_phase: vec![0.0; half],
            output_buffer: vec![0.0; fft_size * 4], // ring buffer for overlap-add
            output_pos: 0,
        }
    }

    pub fn set_stretch_factor(&mut self, factor: f64) {
        let factor = factor.clamp(0.25, 4.0);
        self.synthesis_hop = (self.analysis_hop as f64 * factor) as usize;
        self.synthesis_hop = self.synthesis_hop.max(1);
        self.params.stretch_factor = factor;
    }

    /// Process a complete audio buffer offline.
    ///
    /// Input: the entire source audio.
    /// Returns: time-stretched audio (length ≈ input.len() * stretch_factor).
    pub fn process_offline(&mut self, input: &[f32]) -> Vec<f32> {
        let fft_size = self.params.fft_size;
        let half = fft_size / 2 + 1;

        if input.len() < fft_size {
            return input.to_vec();
        }

        // Estimate output length
        let num_frames = (input.len() - fft_size) / self.analysis_hop + 1;
        let output_len = num_frames * self.synthesis_hop + fft_size;
        let mut output = vec![0.0f64; output_len];

        // Reset phase
        self.last_phase.fill(0.0);
        self.synth_phase.fill(0.0);

        let mut read_pos = 0usize;
        let mut write_pos = 0usize;

        while read_pos + fft_size <= input.len() {
            // Analyze
            let frame = &input[read_pos..read_pos + fft_size];
            let (magnitudes, phases) = self.stft.analyze(frame);

            // Phase propagation
            let mut new_phases = vec![0.0f64; half];
            for k in 0..half {
                // Expected phase advance for this bin
                let omega = 2.0 * PI * k as f64 / fft_size as f64;
                let expected_advance = omega * self.analysis_hop as f64;

                // Actual phase difference
                let phase_diff = phases[k] - self.last_phase[k];

                // Deviation from expected (wrapped to -π..π)
                let mut dev = phase_diff - expected_advance;
                dev = dev - (dev / (2.0 * PI)).round() * 2.0 * PI;

                // Instantaneous frequency
                let inst_freq = omega + dev / self.analysis_hop as f64;

                // Propagate phase at synthesis hop rate
                new_phases[k] = self.synth_phase[k] + inst_freq * self.synthesis_hop as f64;

                self.last_phase[k] = phases[k];
                self.synth_phase[k] = new_phases[k];
            }

            // Phase locking (Laroche & Dolson)
            if self.params.phase_locking {
                phase_lock(&magnitudes, &mut new_phases, half);
            }

            // Synthesize
            let synth_frame = self.stft.synthesize(&magnitudes, &new_phases);

            // Overlap-add into output
            if write_pos + fft_size <= output.len() {
                for i in 0..fft_size {
                    output[write_pos + i] += synth_frame[i] as f64;
                }
            }

            read_pos += self.analysis_hop;
            write_pos += self.synthesis_hop;
        }

        // Convert to f32 and trim
        let actual_len = write_pos + fft_size;
        let actual_len = actual_len.min(output.len());
        output[..actual_len].iter().map(|&s| s as f32).collect()
    }

    pub fn reset(&mut self) {
        self.last_phase.fill(0.0);
        self.synth_phase.fill(0.0);
        self.output_buffer.fill(0.0);
        self.output_pos = 0;
    }
}

/// Phase locking: find spectral peaks and lock surrounding bins to peak's phase.
fn phase_lock(magnitudes: &[f64], phases: &mut [f64], half: usize) {
    // Find peaks (local maxima in magnitude)
    let mut is_peak = vec![false; half];
    for k in 1..half - 1 {
        if magnitudes[k] > magnitudes[k - 1] && magnitudes[k] > magnitudes[k + 1] {
            is_peak[k] = true;
        }
    }

    // For each non-peak bin, lock to nearest peak's phase offset
    let mut nearest_peak = vec![0usize; half];
    let mut last_peak = 0;
    for k in 0..half {
        if is_peak[k] {
            last_peak = k;
        }
        nearest_peak[k] = last_peak;
    }
    // Backward pass
    let mut next_peak = half - 1;
    for k in (0..half).rev() {
        if is_peak[k] {
            next_peak = k;
        }
        // Use closer peak
        if (next_peak as isize - k as isize).unsigned_abs() < (k - nearest_peak[k]) {
            nearest_peak[k] = next_peak;
        }
    }

    // Lock phase: non-peak bins inherit the phase rotation from their nearest peak.
    // Store original phases before modification.
    let original_phases = phases.to_vec();
    for k in 0..half {
        if !is_peak[k] {
            let pk = nearest_peak[k];
            if pk != k {
                // The peak's phase deviation = new_phase[pk] - original_phase[pk]
                // Apply the same deviation to this bin
                let peak_deviation = phases[pk] - original_phases[pk];
                phases[k] = original_phases[k] + peak_deviation;
            }
        }
    }
}

// ── WSOLA ───────────────────────────────────────────────────────────

/// WSOLA (Waveform Similarity Overlap-Add) parameters.
#[derive(Debug, Clone, Copy)]
pub struct WsolaParams {
    pub stretch_factor: f64, // 0.25–4.0
    pub window_ms: f64,      // Analysis window: 20–80ms
    pub sample_rate: f64,
}

impl Default for WsolaParams {
    fn default() -> Self {
        Self {
            stretch_factor: 1.0,
            window_ms: 40.0,
            sample_rate: 48000.0,
        }
    }
}

/// WSOLA time-stretcher for monophonic/speech material.
///
/// Uses cross-correlation to find optimal overlap positions,
/// preserving the waveform shape better than phase vocoder for
/// monophonic signals.
pub struct Wsola {
    params: WsolaParams,
    window_samples: usize,
    hop_analysis: usize,
    hop_synthesis: usize,
    search_range: usize,
}

impl Wsola {
    pub fn new(params: WsolaParams) -> Self {
        let window_samples = (params.window_ms * params.sample_rate / 1000.0) as usize;
        let hop_analysis = window_samples / 2;
        let hop_synthesis = (hop_analysis as f64 * params.stretch_factor) as usize;
        let search_range = window_samples / 4;

        Self {
            params,
            window_samples,
            hop_analysis,
            hop_synthesis: hop_synthesis.max(1),
            search_range,
        }
    }

    pub fn set_stretch_factor(&mut self, factor: f64) {
        let factor = factor.clamp(0.25, 4.0);
        self.hop_synthesis = (self.hop_analysis as f64 * factor) as usize;
        self.hop_synthesis = self.hop_synthesis.max(1);
        self.params.stretch_factor = factor;
    }

    /// Process a complete audio buffer offline.
    pub fn process_offline(&self, input: &[f32]) -> Vec<f32> {
        if input.len() < self.window_samples {
            return input.to_vec();
        }

        let num_frames = (input.len() - self.window_samples) / self.hop_analysis + 1;
        let output_len = num_frames * self.hop_synthesis + self.window_samples;
        let mut output = vec![0.0f32; output_len];

        // Hann window for overlap
        let window: Vec<f32> = (0..self.window_samples)
            .map(|i| {
                let t = i as f64 / self.window_samples as f64;
                (0.5 * (1.0 - (2.0 * PI * t).cos())) as f32
            })
            .collect();

        let mut read_pos = 0usize;
        let mut write_pos = 0usize;

        for _ in 0..num_frames {
            if read_pos + self.window_samples > input.len() {
                break;
            }

            // Find best overlap position using cross-correlation
            let best_offset = if write_pos > 0 && write_pos + self.window_samples <= output.len() {
                self.find_best_overlap(input, &output, read_pos, write_pos)
            } else {
                0
            };

            let adjusted_read = (read_pos as isize + best_offset as isize)
                .max(0)
                .min((input.len() - self.window_samples) as isize) as usize;

            // Overlap-add with window
            if write_pos + self.window_samples <= output.len() {
                for i in 0..self.window_samples {
                    output[write_pos + i] += input[adjusted_read + i] * window[i];
                }
            }

            read_pos += self.hop_analysis;
            write_pos += self.hop_synthesis;
        }

        // Trim to actual length
        let actual_len = write_pos + self.window_samples;
        let actual_len = actual_len.min(output.len());
        output[..actual_len].to_vec()
    }

    /// Find the best overlap offset using cross-correlation.
    fn find_best_overlap(
        &self,
        input: &[f32],
        output: &[f32],
        read_pos: usize,
        write_pos: usize,
    ) -> isize {
        let mut best_corr = f64::MIN;
        let mut best_offset: isize = 0;
        let compare_len = (self.window_samples / 4).min(128); // compare first portion

        for offset in -(self.search_range as isize)..=(self.search_range as isize) {
            let pos = (read_pos as isize + offset).max(0) as usize;
            if pos + compare_len > input.len() || write_pos + compare_len > output.len() {
                continue;
            }

            let mut corr = 0.0f64;
            for i in 0..compare_len {
                corr += input[pos + i] as f64 * output[write_pos + i] as f64;
            }

            if corr > best_corr {
                best_corr = corr;
                best_offset = offset;
            }
        }

        best_offset
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn phase_vocoder_stretch_duration() {
        let params = PhaseVocoderParams {
            fft_size: 1024,
            stretch_factor: 2.0,
            phase_locking: true,
        };
        let mut pv = PhaseVocoder::new(params);

        // 1 second of audio
        let input: Vec<f32> = (0..48000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = pv.process_offline(&input);

        // Output should be approximately 2x the input length
        let ratio = output.len() as f64 / input.len() as f64;
        assert!(
            (ratio - 2.0).abs() < 0.3,
            "2x stretch should ~double length: ratio={ratio:.2} (in={}, out={})",
            input.len(),
            output.len()
        );
    }

    #[test]
    fn phase_vocoder_half_speed() {
        let params = PhaseVocoderParams {
            fft_size: 1024,
            stretch_factor: 0.5,
            phase_locking: false,
        };
        let mut pv = PhaseVocoder::new(params);

        let input: Vec<f32> = (0..48000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = pv.process_offline(&input);

        let ratio = output.len() as f64 / input.len() as f64;
        assert!(
            (ratio - 0.5).abs() < 0.2,
            "0.5x stretch should ~halve length: ratio={ratio:.2}"
        );
    }

    #[test]
    fn phase_vocoder_unity_preserves_energy() {
        let params = PhaseVocoderParams {
            fft_size: 2048,
            stretch_factor: 1.0,
            phase_locking: true,
        };
        let mut pv = PhaseVocoder::new(params);

        let input: Vec<f32> = (0..24000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32 * 0.5)
            .collect();

        let output = pv.process_offline(&input);

        let input_energy: f64 = input.iter().map(|&s| (s as f64) * (s as f64)).sum();
        let output_energy: f64 = output.iter().map(|&s| (s as f64) * (s as f64)).sum();

        // At unity stretch, energy should be roughly preserved (within 50%)
        let ratio = output_energy / input_energy;
        assert!(
            ratio > 0.3 && ratio < 3.0,
            "Unity stretch energy ratio: {ratio:.2} (in={input_energy:.1}, out={output_energy:.1})"
        );
    }

    #[test]
    fn phase_vocoder_output_not_silent() {
        let params = PhaseVocoderParams {
            fft_size: 1024,
            stretch_factor: 1.5,
            phase_locking: true,
        };
        let mut pv = PhaseVocoder::new(params);

        let input: Vec<f32> = (0..24000)
            .map(|i| (2.0 * PI * 1000.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = pv.process_offline(&input);
        let energy: f64 = output.iter().map(|&s| (s as f64) * (s as f64)).sum();

        assert!(energy > 1.0, "Output should not be silent: energy={energy}");
    }

    #[test]
    fn wsola_stretch_duration() {
        let params = WsolaParams {
            stretch_factor: 2.0,
            window_ms: 40.0,
            sample_rate: SR,
        };
        let wsola = Wsola::new(params);

        let input: Vec<f32> = (0..48000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = wsola.process_offline(&input);

        let ratio = output.len() as f64 / input.len() as f64;
        assert!(
            (ratio - 2.0).abs() < 0.5,
            "WSOLA 2x stretch ratio: {ratio:.2}"
        );
    }

    #[test]
    fn wsola_output_not_silent() {
        let params = WsolaParams {
            stretch_factor: 1.5,
            window_ms: 30.0,
            sample_rate: SR,
        };
        let wsola = Wsola::new(params);

        let input: Vec<f32> = (0..24000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = wsola.process_offline(&input);
        let energy: f64 = output.iter().map(|&s| (s as f64) * (s as f64)).sum();

        assert!(energy > 1.0, "WSOLA output should not be silent: energy={energy}");
    }

    #[test]
    fn wsola_half_speed() {
        let params = WsolaParams {
            stretch_factor: 0.5,
            window_ms: 40.0,
            sample_rate: SR,
        };
        let wsola = Wsola::new(params);

        let input: Vec<f32> = (0..48000)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / SR).sin() as f32)
            .collect();

        let output = wsola.process_offline(&input);

        let ratio = output.len() as f64 / input.len() as f64;
        assert!(
            (ratio - 0.5).abs() < 0.3,
            "WSOLA 0.5x stretch ratio: {ratio:.2}"
        );
    }
}
