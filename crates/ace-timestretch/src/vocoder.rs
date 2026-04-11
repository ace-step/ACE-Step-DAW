//! Enhanced phase vocoder with transient-aware processing.
//!
//! Key improvements over basic phase vocoder:
//! - Identity phase locking (Laroche & Dolson 1999)
//! - Transient detection + time-domain splicing
//! - Configurable quality levels
//! - Real-time incremental processing mode

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use core::f64::consts::PI;
use rustfft::{num_complex::Complex, FftPlanner};

use crate::transient::detect_transients;

/// Quality preset for stretch processing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StretchQuality {
    /// Lowest latency, basic phase vocoder. For AudioWorklet real-time.
    Realtime,
    /// Standard quality with phase locking.
    Standard,
    /// Highest quality: transient detection + splicing + phase locking.
    High,
}

/// Parameters for the stretch engine.
#[derive(Debug, Clone)]
pub struct StretchParams {
    pub sample_rate: u32,
    pub fft_size: usize,
    pub quality: StretchQuality,
}

impl Default for StretchParams {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            fft_size: 2048,
            quality: StretchQuality::Standard,
        }
    }
}

/// The main stretch engine.
pub struct StretchEngine {
    params: StretchParams,
    stretch_factor: f64,
    // FFT state
    fft_size: usize,
    half: usize,
    analysis_hop: usize,
    synthesis_hop: usize,
    // Phase accumulators
    last_phase: Vec<f64>,
    synth_phase: Vec<f64>,
    // Window
    window: Vec<f64>,
    // Real-time input accumulation buffer
    input_buffer: Vec<f32>,
    input_write_pos: usize,
    // Real-time output buffer
    output_buffer: Vec<f64>,
    output_read_pos: usize,
    output_write_pos: usize,
    frames_processed: usize,
}

impl StretchEngine {
    pub fn new(params: StretchParams) -> Self {
        let fft_size = match params.quality {
            StretchQuality::Realtime => 1024,
            StretchQuality::Standard => 2048,
            StretchQuality::High => 4096,
        };
        let half = fft_size / 2 + 1;
        let analysis_hop = fft_size / 4;
        let synthesis_hop = analysis_hop; // 1:1 for factor=1.0

        let window: Vec<f64> = (0..fft_size)
            .map(|i| {
                let t = i as f64 / fft_size as f64;
                0.5 * (1.0 - (2.0 * PI * t).cos())
            })
            .collect();

        let output_buf_size = fft_size * 8;

        Self {
            params: params.clone(),
            stretch_factor: 1.0,
            fft_size,
            half,
            analysis_hop,
            synthesis_hop,
            last_phase: vec![0.0; half],
            synth_phase: vec![0.0; half],
            window,
            input_buffer: vec![0.0; fft_size * 4],
            input_write_pos: 0,
            output_buffer: vec![0.0; output_buf_size],
            output_read_pos: 0,
            output_write_pos: 0,
            frames_processed: 0,
        }
    }

    pub fn set_stretch_factor(&mut self, factor: f64) {
        let factor = factor.clamp(0.1, 8.0);
        self.stretch_factor = factor;
        self.synthesis_hop = ((self.analysis_hop as f64) * factor) as usize;
        self.synthesis_hop = self.synthesis_hop.max(1);
    }

    /// Process a complete buffer offline (highest quality).
    pub fn process_offline(&mut self, input: &[f32], factor: f64) -> Vec<f32> {
        self.set_stretch_factor(factor);
        self.reset();

        if input.len() < self.fft_size {
            return input.to_vec();
        }

        // For High quality: detect transients and splice around them
        if self.params.quality == StretchQuality::High {
            return self.process_with_transients(input, factor);
        }

        // Standard / Realtime: straight phase vocoder
        self.phase_vocoder_offline(input)
    }

    /// Real-time incremental processing — feed small blocks, get output.
    pub fn process_block(&mut self, input: &[f32]) -> Vec<f32> {
        // Accumulate input
        for &sample in input {
            if self.input_write_pos < self.input_buffer.len() {
                self.input_buffer[self.input_write_pos] = sample;
                self.input_write_pos += 1;
            }
        }

        // Process complete frames
        let mut output_samples = Vec::new();
        while self.input_write_pos >= self.fft_size {
            let frame: Vec<f32> = self.input_buffer[..self.fft_size].to_vec();

            // Phase vocoder on this frame
            self.process_single_frame(&frame);

            // Shift input buffer
            let remaining = self.input_write_pos - self.analysis_hop;
            self.input_buffer.copy_within(self.analysis_hop..self.input_write_pos, 0);
            self.input_write_pos = remaining;

            // Collect output samples for this hop
            let out_count = self.synthesis_hop;
            for _ in 0..out_count {
                if self.output_read_pos < self.output_write_pos {
                    let idx = self.output_read_pos % self.output_buffer.len();
                    output_samples.push(self.output_buffer[idx] as f32);
                    self.output_buffer[idx] = 0.0;
                    self.output_read_pos += 1;
                }
            }
        }

        output_samples
    }

    pub fn reset(&mut self) {
        self.last_phase.fill(0.0);
        self.synth_phase.fill(0.0);
        self.input_buffer.fill(0.0);
        self.input_write_pos = 0;
        self.output_buffer.fill(0.0);
        self.output_read_pos = 0;
        self.output_write_pos = 0;
        self.frames_processed = 0;
    }

    // ── Internal ─────────────────────────────────────────────────────

    fn phase_vocoder_offline(&mut self, input: &[f32]) -> Vec<f32> {
        let num_frames = (input.len() - self.fft_size) / self.analysis_hop + 1;
        let output_len = num_frames * self.synthesis_hop + self.fft_size;
        let mut output = vec![0.0f64; output_len];

        let mut planner = FftPlanner::new();
        let fft_forward = planner.plan_fft_forward(self.fft_size);
        let fft_inverse = planner.plan_fft_inverse(self.fft_size);

        let mut read_pos = 0usize;
        let mut write_pos = 0usize;

        while read_pos + self.fft_size <= input.len() {
            // Windowed analysis
            let mut spectrum: Vec<Complex<f64>> = (0..self.fft_size)
                .map(|i| Complex::new(input[read_pos + i] as f64 * self.window[i], 0.0))
                .collect();
            fft_forward.process(&mut spectrum);

            // Extract magnitude and phase
            let magnitudes: Vec<f64> = (0..self.half).map(|k| spectrum[k].norm()).collect();
            let phases: Vec<f64> = (0..self.half).map(|k| spectrum[k].arg()).collect();

            // Phase propagation with phase locking
            let new_phases = self.propagate_phases(&magnitudes, &phases);

            // Reconstruct spectrum
            let mut synth_spectrum: Vec<Complex<f64>> = vec![Complex::new(0.0, 0.0); self.fft_size];
            for k in 0..self.half {
                synth_spectrum[k] = Complex::from_polar(magnitudes[k], new_phases[k]);
                if k > 0 && k < self.half - 1 {
                    synth_spectrum[self.fft_size - k] = synth_spectrum[k].conj();
                }
            }

            // Inverse FFT
            fft_inverse.process(&mut synth_spectrum);
            let scale = 1.0 / self.fft_size as f64;

            // Overlap-add with synthesis window
            if write_pos + self.fft_size <= output.len() {
                for i in 0..self.fft_size {
                    output[write_pos + i] += synth_spectrum[i].re * scale * self.window[i];
                }
            }

            read_pos += self.analysis_hop;
            write_pos += self.synthesis_hop;
        }

        let actual_len = (write_pos + self.fft_size).min(output.len());
        output[..actual_len].iter().map(|&s| s as f32).collect()
    }

    fn process_with_transients(&mut self, input: &[f32], factor: f64) -> Vec<f32> {
        let transients = detect_transients(input, self.params.sample_rate, self.analysis_hop);

        if transients.is_empty() {
            return self.phase_vocoder_offline(input);
        }

        // Split audio at transient boundaries, process segments, splice back
        let mut segments: Vec<(usize, usize, bool)> = Vec::new(); // (start, end, is_transient_region)
        let splice_margin = self.fft_size; // margin around transients for time-domain copy

        let mut pos = 0usize;
        for t in &transients {
            let t_start = t.sample_pos.saturating_sub(splice_margin).max(pos);
            let t_end = (t.sample_pos + splice_margin).min(input.len());

            if t_start > pos {
                // Tonal segment before transient → phase vocoder
                segments.push((pos, t_start, false));
            }
            // Transient region → time-domain copy (no phase vocoder)
            segments.push((t_start, t_end, true));
            pos = t_end;
        }
        if pos < input.len() {
            segments.push((pos, input.len(), false));
        }

        // Process each segment
        let mut output = Vec::new();
        for (start, end, is_transient) in &segments {
            let segment = &input[*start..*end];
            if segment.len() < self.fft_size {
                // Too short for phase vocoder — just resample
                let stretched_len = (segment.len() as f64 * factor) as usize;
                let mut stretched = vec![0.0f32; stretched_len.max(1)];
                for i in 0..stretched.len() {
                    let src = i as f64 / factor;
                    let idx = src as usize;
                    let frac = src - idx as f64;
                    if idx + 1 < segment.len() {
                        stretched[i] = segment[idx] * (1.0 - frac as f32) + segment[idx + 1] * frac as f32;
                    } else if idx < segment.len() {
                        stretched[i] = segment[idx];
                    }
                }
                output.extend_from_slice(&stretched);
                continue;
            }

            if *is_transient {
                // Time-domain copy: preserve transient exactly, adjust timing
                // For stretch > 1: insert silence around transient
                // For stretch < 1: trim around transient
                let target_len = (segment.len() as f64 * factor) as usize;
                if target_len >= segment.len() {
                    // Stretch: copy transient, pad with crossfaded edges
                    let pad = (target_len - segment.len()) / 2;
                    output.extend(core::iter::repeat(0.0f32).take(pad));
                    output.extend_from_slice(segment);
                    output.extend(core::iter::repeat(0.0f32).take(target_len - segment.len() - pad));
                } else {
                    // Compress: center-crop the transient
                    let skip = (segment.len() - target_len) / 2;
                    output.extend_from_slice(&segment[skip..skip + target_len]);
                }
            } else {
                // Tonal segment: full phase vocoder processing
                self.reset();
                let stretched = self.phase_vocoder_offline(segment);
                output.extend_from_slice(&stretched);
            }
        }

        output
    }

    fn propagate_phases(&mut self, magnitudes: &[f64], phases: &[f64]) -> Vec<f64> {
        let mut new_phases = vec![0.0f64; self.half];

        for k in 0..self.half {
            let omega = 2.0 * PI * k as f64 / self.fft_size as f64;
            let expected_advance = omega * self.analysis_hop as f64;
            let phase_diff = phases[k] - self.last_phase[k];
            let mut dev = phase_diff - expected_advance;
            dev -= (dev / (2.0 * PI)).round() * 2.0 * PI;
            let inst_freq = omega + dev / self.analysis_hop as f64;
            new_phases[k] = self.synth_phase[k] + inst_freq * self.synthesis_hop as f64;

            self.last_phase[k] = phases[k];
        }

        // Identity phase locking (Laroche & Dolson)
        if self.params.quality != StretchQuality::Realtime {
            self.apply_phase_locking(magnitudes, &mut new_phases);
        }

        // Update synth phase after locking
        self.synth_phase.copy_from_slice(&new_phases);

        new_phases
    }

    fn apply_phase_locking(&self, magnitudes: &[f64], phases: &mut [f64]) {
        // Find spectral peaks
        let original = phases.to_vec();
        let mut is_peak = vec![false; self.half];
        for k in 1..self.half.saturating_sub(1) {
            if magnitudes[k] > magnitudes[k - 1] && magnitudes[k] > magnitudes[k + 1] {
                is_peak[k] = true;
            }
        }

        // Nearest peak map (forward + backward)
        let mut nearest = vec![0usize; self.half];
        let mut last = 0;
        for k in 0..self.half {
            if is_peak[k] { last = k; }
            nearest[k] = last;
        }
        let mut next = self.half.saturating_sub(1);
        for k in (0..self.half).rev() {
            if is_peak[k] { next = k; }
            if (next as isize - k as isize).unsigned_abs() < (k - nearest[k]) {
                nearest[k] = next;
            }
        }

        // Lock non-peak bins to their nearest peak's phase rotation
        for k in 0..self.half {
            if !is_peak[k] {
                let pk = nearest[k];
                if pk != k {
                    let dev = phases[pk] - original[pk];
                    phases[k] = original[k] + dev;
                }
            }
        }
    }

    fn process_single_frame(&mut self, frame: &[f32]) {
        let mut planner = FftPlanner::new();
        let fft_forward = planner.plan_fft_forward(self.fft_size);
        let fft_inverse = planner.plan_fft_inverse(self.fft_size);

        // Windowed FFT
        let mut spectrum: Vec<Complex<f64>> = (0..self.fft_size)
            .map(|i| Complex::new(frame[i] as f64 * self.window[i], 0.0))
            .collect();
        fft_forward.process(&mut spectrum);

        let magnitudes: Vec<f64> = (0..self.half).map(|k| spectrum[k].norm()).collect();
        let phases: Vec<f64> = (0..self.half).map(|k| spectrum[k].arg()).collect();

        let new_phases = self.propagate_phases(&magnitudes, &phases);

        // Reconstruct
        let mut synth_spectrum = vec![Complex::new(0.0, 0.0); self.fft_size];
        for k in 0..self.half {
            synth_spectrum[k] = Complex::from_polar(magnitudes[k], new_phases[k]);
            if k > 0 && k < self.half - 1 {
                synth_spectrum[self.fft_size - k] = synth_spectrum[k].conj();
            }
        }
        fft_inverse.process(&mut synth_spectrum);
        let scale = 1.0 / self.fft_size as f64;

        // Overlap-add into circular output buffer
        let buf_len = self.output_buffer.len();
        for i in 0..self.fft_size {
            let idx = (self.output_write_pos + i) % buf_len;
            self.output_buffer[idx] += synth_spectrum[i].re * scale * self.window[i];
        }
        self.output_write_pos += self.synthesis_hop;
        self.frames_processed += 1;
    }
}
