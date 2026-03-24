use crossbeam::queue::SegQueue;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

/// A MIDI event to be processed by a VST3 plugin.
#[derive(Debug, Clone, PartialEq)]
pub struct MidiEvent {
    /// MIDI status byte (e.g. 0x90 for note-on, 0x80 for note-off).
    pub status: u8,
    /// First data byte (e.g. note number).
    pub data1: u8,
    /// Second data byte (e.g. velocity).
    pub data2: u8,
    /// Sample offset within the current buffer where this event occurs.
    pub sample_offset: u32,
}

/// A queued parameter change.
#[derive(Debug, Clone, PartialEq)]
struct ParameterChange {
    param_id: u32,
    value: f64,
}

/// Configuration for the audio processing pipeline.
#[derive(Debug, Clone)]
pub struct AudioConfig {
    pub sample_rate: f64,
    pub block_size: u32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 44100.0,
            block_size: 512,
        }
    }
}

/// Manages real-time audio processing for a single VST3 plugin instance.
///
/// Uses lock-free queues for MIDI events and parameter changes so that
/// the audio thread is never blocked by the UI/control thread.
pub struct AudioThread {
    config: AudioConfig,
    active: AtomicBool,
    latency: AtomicU32,

    /// Lock-free queue for incoming MIDI events.
    midi_queue: Arc<SegQueue<MidiEvent>>,

    /// Lock-free queue for parameter changes.
    param_queue: Arc<SegQueue<ParameterChange>>,

    /// Whether this instance is an instrument (true) or effect (false).
    /// Instruments generate audio from MIDI; effects pass audio through.
    is_instrument: bool,
}

impl AudioThread {
    /// Create a new AudioThread.
    ///
    /// * `is_instrument` — if true, the plugin generates audio from MIDI
    ///   (input is ignored). If false, input audio passes through the plugin.
    pub fn new(is_instrument: bool) -> Self {
        Self {
            config: AudioConfig::default(),
            active: AtomicBool::new(false),
            latency: AtomicU32::new(0),
            midi_queue: Arc::new(SegQueue::new()),
            param_queue: Arc::new(SegQueue::new()),
            is_instrument,
        }
    }

    /// Set the sample rate and block size.
    pub fn configure(&mut self, sample_rate: f64, block_size: u32) {
        self.config.sample_rate = sample_rate;
        self.config.block_size = block_size;
    }

    /// Start processing (activates the plugin).
    pub fn start(&mut self) {
        self.active.store(true, Ordering::Release);
    }

    /// Stop processing (deactivates the plugin).
    pub fn stop(&mut self) {
        self.active.store(false, Ordering::Release);
    }

    /// Returns true if the audio thread is currently active.
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    /// Queue MIDI events for the next process call.
    ///
    /// This is thread-safe and lock-free — safe to call from any thread.
    pub fn queue_midi(&self, events: Vec<MidiEvent>) {
        for event in events {
            self.midi_queue.push(event);
        }
    }

    /// Set a parameter value (thread-safe, lock-free).
    ///
    /// The value is queued and applied on the next `process()` call.
    pub fn set_parameter(&self, param_id: u32, value: f64) {
        self.param_queue.push(ParameterChange { param_id, value });
    }

    /// Get current latency in samples.
    pub fn latency_samples(&self) -> u32 {
        self.latency.load(Ordering::Acquire)
    }

    /// Set the reported latency in samples (e.g. after plugin reports its latency).
    pub fn set_latency(&self, samples: u32) {
        self.latency.store(samples, Ordering::Release);
    }

    /// Return the current audio configuration.
    pub fn config(&self) -> &AudioConfig {
        &self.config
    }

    /// Process audio through the VST3 plugin.
    ///
    /// Takes an input buffer of interleaved f32 samples and returns the
    /// output buffer. For instruments the input is ignored and audio is
    /// generated from queued MIDI events. For effects the input passes
    /// through (stub: passthrough until real VST3 integration).
    ///
    /// # Arguments
    /// * `input` — interleaved f32 samples (`channels * samples` elements)
    /// * `channels` — number of audio channels (e.g. 2 for stereo)
    /// * `samples` — number of sample frames
    ///
    /// # Returns
    /// Output buffer of interleaved f32 samples.
    pub fn process(&mut self, input: &[f32], channels: u32, samples: u32) -> Vec<f32> {
        let total = (channels * samples) as usize;

        // 1. Drain pending MIDI events.
        let mut midi_events = Vec::new();
        while let Some(event) = self.midi_queue.pop() {
            midi_events.push(event);
        }

        // 2. Drain pending parameter changes.
        let mut param_changes = Vec::new();
        while let Some(change) = self.param_queue.pop() {
            param_changes.push(change);
        }

        // 3. If not active, return silence.
        if !self.active.load(Ordering::Acquire) {
            return vec![0.0f32; total];
        }

        // 4. Stub processing — will be replaced with real VST3 process call.
        //
        //    - Instruments: generate silence (real implementation would use
        //      midi_events to synthesise audio).
        //    - Effects: passthrough (real implementation would run the plugin
        //      DSP on the input buffer).
        if self.is_instrument {
            // Instrument stub: silence (MIDI events consumed but not rendered yet).
            vec![0.0f32; total]
        } else {
            // Effect stub: passthrough input unchanged.
            if input.len() >= total {
                input[..total].to_vec()
            } else {
                // Pad with silence if input is shorter than expected.
                let mut output = input.to_vec();
                output.resize(total, 0.0);
                output
            }
        }
    }

    // -- Internal helpers for testing -----------------------------------------

    /// Drain all pending MIDI events (test helper).
    #[cfg(test)]
    fn drain_midi(&self) -> Vec<MidiEvent> {
        let mut events = Vec::new();
        while let Some(e) = self.midi_queue.pop() {
            events.push(e);
        }
        events
    }

    /// Drain all pending parameter changes (test helper).
    #[cfg(test)]
    fn drain_params(&self) -> Vec<ParameterChange> {
        let mut changes = Vec::new();
        while let Some(c) = self.param_queue.pop() {
            changes.push(c);
        }
        changes
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configure_sets_sample_rate_and_block_size() {
        let mut at = AudioThread::new(false);
        at.configure(96000.0, 1024);
        assert_eq!(at.config().sample_rate, 96000.0);
        assert_eq!(at.config().block_size, 1024);
    }

    #[test]
    fn effect_passthrough_returns_same_data() {
        let mut at = AudioThread::new(false);
        at.configure(44100.0, 4);
        at.start();

        let input: Vec<f32> = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let output = at.process(&input, 2, 4);
        assert_eq!(output, input);
    }

    #[test]
    fn instrument_returns_silence() {
        let mut at = AudioThread::new(true);
        at.configure(44100.0, 4);
        at.start();

        let input: Vec<f32> = vec![1.0; 8];
        let output = at.process(&input, 2, 4);
        assert_eq!(output, vec![0.0f32; 8]);
    }

    #[test]
    fn inactive_thread_returns_silence() {
        let mut at = AudioThread::new(false);
        at.configure(44100.0, 4);
        // not started

        let input: Vec<f32> = vec![1.0; 8];
        let output = at.process(&input, 2, 4);
        assert_eq!(output, vec![0.0f32; 8]);
    }

    #[test]
    fn queue_midi_and_process_dequeues_events() {
        let mut at = AudioThread::new(true);
        at.configure(44100.0, 256);
        at.start();

        let events = vec![
            MidiEvent {
                status: 0x90,
                data1: 60,
                data2: 100,
                sample_offset: 0,
            },
            MidiEvent {
                status: 0x80,
                data1: 60,
                data2: 0,
                sample_offset: 128,
            },
        ];
        at.queue_midi(events.clone());

        // Events should be in the queue before process.
        assert!(!at.midi_queue.is_empty());

        // Process drains the queue.
        let _output = at.process(&[], 2, 256);

        // Queue should be empty after process.
        assert!(at.midi_queue.is_empty());
    }

    #[test]
    fn queue_midi_is_threadsafe() {
        let at = AudioThread::new(true);
        let queue = Arc::clone(&at.midi_queue);

        let handle = std::thread::spawn(move || {
            queue.push(MidiEvent {
                status: 0x90,
                data1: 72,
                data2: 127,
                sample_offset: 0,
            });
        });

        handle.join().unwrap();

        let drained = at.drain_midi();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].data1, 72);
    }

    #[test]
    fn set_parameter_updates_atomically() {
        let at = AudioThread::new(false);

        at.set_parameter(1, 0.5);
        at.set_parameter(2, 0.75);
        at.set_parameter(1, 0.9);

        let changes = at.drain_params();
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].param_id, 1);
        assert!((changes[0].value - 0.5).abs() < f64::EPSILON);
        assert_eq!(changes[1].param_id, 2);
        assert!((changes[1].value - 0.75).abs() < f64::EPSILON);
        assert_eq!(changes[2].param_id, 1);
        assert!((changes[2].value - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn set_parameter_is_threadsafe() {
        let at = AudioThread::new(false);
        let queue = Arc::clone(&at.param_queue);

        let handle = std::thread::spawn(move || {
            queue.push(ParameterChange {
                param_id: 42,
                value: 1.0,
            });
        });

        handle.join().unwrap();

        let changes = at.drain_params();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].param_id, 42);
    }

    #[test]
    fn latency_samples_default_zero() {
        let at = AudioThread::new(false);
        assert_eq!(at.latency_samples(), 0);
    }

    #[test]
    fn set_and_get_latency() {
        let at = AudioThread::new(false);
        at.set_latency(256);
        assert_eq!(at.latency_samples(), 256);
    }

    #[test]
    fn start_and_stop_toggle_active() {
        let mut at = AudioThread::new(false);
        assert!(!at.is_active());
        at.start();
        assert!(at.is_active());
        at.stop();
        assert!(!at.is_active());
    }

    #[test]
    fn process_pads_short_input_for_effects() {
        let mut at = AudioThread::new(false);
        at.configure(44100.0, 4);
        at.start();

        // Input shorter than channels*samples.
        let input: Vec<f32> = vec![0.5, 0.6];
        let output = at.process(&input, 2, 4);
        assert_eq!(output.len(), 8);
        assert_eq!(output[0], 0.5);
        assert_eq!(output[1], 0.6);
        assert_eq!(output[2], 0.0); // padded
    }
}
