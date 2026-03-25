use crossbeam::queue::SegQueue;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use vst3::Steinberg::Vst::{
    AudioBusBuffers, AudioBusBuffers__type0, IAudioProcessorTrait, IComponentTrait,
    ProcessData, ProcessSetup, ProcessModes_, SymbolicSampleSizes_,
};
use vst3::Steinberg::kResultOk;

use crate::vst3_loader::Vst3PluginInstance;

/// A MIDI event to be processed by a VST3 plugin.
#[derive(Debug, Clone, PartialEq)]
pub struct MidiEvent {
    pub status: u8,
    pub data1: u8,
    pub data2: u8,
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
pub struct AudioThread {
    config: AudioConfig,
    active: AtomicBool,
    latency: AtomicU32,
    midi_queue: Arc<SegQueue<MidiEvent>>,
    param_queue: Arc<SegQueue<ParameterChange>>,
    is_instrument: bool,
    /// The live VST3 instance (None = stub mode).
    plugin: Option<Arc<Vst3PluginInstance>>,
    /// Whether setupProcessing has been called on the plugin.
    setup_done: bool,
}

impl AudioThread {
    pub fn new(is_instrument: bool) -> Self {
        Self {
            config: AudioConfig::default(),
            active: AtomicBool::new(false),
            latency: AtomicU32::new(0),
            midi_queue: Arc::new(SegQueue::new()),
            param_queue: Arc::new(SegQueue::new()),
            is_instrument,
            plugin: None,
            setup_done: false,
        }
    }

    /// Attach a real VST3 plugin instance for audio processing.
    pub fn set_plugin(&mut self, plugin: Arc<Vst3PluginInstance>) {
        self.plugin = Some(plugin);
        self.setup_done = false;
    }

    /// Set the sample rate and block size.
    pub fn configure(&mut self, sample_rate: f64, block_size: u32) {
        self.config.sample_rate = sample_rate;
        self.config.block_size = block_size;
        self.setup_done = false; // Need to re-setup the plugin
    }

    /// Start processing (activates the plugin).
    pub fn start(&mut self) {
        if let Some(ref plugin) = self.plugin {
            // Setup processing if not done yet
            if !self.setup_done {
                let mut setup = ProcessSetup {
                    processMode: ProcessModes_::kRealtime as i32,
                    symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                    maxSamplesPerBlock: self.config.block_size as i32,
                    sampleRate: self.config.sample_rate,
                };
                unsafe {
                    let result = plugin.processor.setupProcessing(&mut setup);
                    if result != kResultOk {
                        tracing::warn!(result, "setupProcessing returned non-OK");
                    }
                }
                self.setup_done = true;
            }
            // Activate the component
            unsafe {
                plugin.component.setActive(1); // TBool: 1 = true
                plugin.processor.setProcessing(1);
            }
        }
        self.active.store(true, Ordering::Release);
    }

    /// Stop processing (deactivates the plugin).
    pub fn stop(&mut self) {
        if let Some(ref plugin) = self.plugin {
            unsafe {
                plugin.processor.setProcessing(0);
                plugin.component.setActive(0);
            }
        }
        self.active.store(false, Ordering::Release);
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Acquire)
    }

    pub fn queue_midi(&self, events: Vec<MidiEvent>) {
        for event in events {
            self.midi_queue.push(event);
        }
    }

    pub fn set_parameter(&self, param_id: u32, value: f64) {
        self.param_queue.push(ParameterChange { param_id, value });
    }

    pub fn latency_samples(&self) -> u32 {
        self.latency.load(Ordering::Acquire)
    }

    pub fn set_latency(&self, samples: u32) {
        self.latency.store(samples, Ordering::Release);
    }

    pub fn config(&self) -> &AudioConfig {
        &self.config
    }

    /// Process audio through the VST3 plugin.
    ///
    /// Input/output are interleaved f32 samples. If a real plugin is attached,
    /// audio is processed through `IAudioProcessor::process()`. Otherwise falls
    /// back to stub behavior (instruments=silence, effects=passthrough).
    pub fn process(&mut self, input: &[f32], channels: u32, samples: u32) -> Vec<f32> {
        let total = (channels * samples) as usize;

        // Drain queues
        let mut _midi_events = Vec::new();
        while let Some(event) = self.midi_queue.pop() {
            _midi_events.push(event);
        }
        let mut _param_changes = Vec::new();
        while let Some(change) = self.param_queue.pop() {
            _param_changes.push(change);
        }

        if !self.active.load(Ordering::Acquire) {
            return vec![0.0f32; total];
        }

        // Try real VST3 processing
        if let Some(ref plugin) = self.plugin {
            return self.process_vst3(plugin.clone(), input, channels, samples);
        }

        // Stub fallback
        if self.is_instrument {
            vec![0.0f32; total]
        } else if input.len() >= total {
            input[..total].to_vec()
        } else {
            let mut output = input.to_vec();
            output.resize(total, 0.0);
            output
        }
    }

    /// Process audio through the real VST3 plugin.
    fn process_vst3(
        &self,
        plugin: Arc<Vst3PluginInstance>,
        input: &[f32],
        channels: u32,
        samples: u32,
    ) -> Vec<f32> {
        let num_channels = channels as usize;
        let num_samples = samples as usize;
        let total = num_channels * num_samples;

        // De-interleave input into per-channel buffers
        let mut input_channels: Vec<Vec<f32>> = vec![vec![0.0; num_samples]; num_channels];
        for s in 0..num_samples {
            for ch in 0..num_channels {
                let idx = s * num_channels + ch;
                if idx < input.len() {
                    input_channels[ch][s] = input[idx];
                }
            }
        }

        // Create output channel buffers
        let mut output_channels: Vec<Vec<f32>> = vec![vec![0.0; num_samples]; num_channels];

        // Build raw pointer arrays for AudioBusBuffers
        let mut input_ptrs: Vec<*mut f32> = input_channels
            .iter_mut()
            .map(|ch| ch.as_mut_ptr())
            .collect();
        let mut output_ptrs: Vec<*mut f32> = output_channels
            .iter_mut()
            .map(|ch| ch.as_mut_ptr())
            .collect();

        let mut input_bus = AudioBusBuffers {
            numChannels: num_channels as i32,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: input_ptrs.as_mut_ptr(),
            },
        };

        let mut output_bus = AudioBusBuffers {
            numChannels: num_channels as i32,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_ptrs.as_mut_ptr(),
            },
        };

        let mut process_data = ProcessData {
            processMode: ProcessModes_::kRealtime as i32,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: num_samples as i32,
            numInputs: if self.is_instrument { 0 } else { 1 },
            numOutputs: 1,
            inputs: if self.is_instrument { ptr::null_mut() } else { &mut input_bus },
            outputs: &mut output_bus,
            inputParameterChanges: ptr::null_mut(), // TODO: W4 will implement IParameterChanges
            outputParameterChanges: ptr::null_mut(),
            inputEvents: ptr::null_mut(), // TODO: W4 will implement IEventList for MIDI
            outputEvents: ptr::null_mut(),
            processContext: ptr::null_mut(),
        };

        let result = unsafe { plugin.processor.process(&mut process_data) };
        if result != kResultOk {
            tracing::warn!(result, "IAudioProcessor::process returned non-OK");
            return vec![0.0f32; total];
        }

        // Re-interleave output
        let mut output = vec![0.0f32; total];
        for s in 0..num_samples {
            for ch in 0..num_channels {
                output[s * num_channels + ch] = output_channels[ch][s];
            }
        }

        output
    }

    #[cfg(test)]
    fn drain_midi(&self) -> Vec<MidiEvent> {
        let mut events = Vec::new();
        while let Some(e) = self.midi_queue.pop() {
            events.push(e);
        }
        events
    }

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
            MidiEvent { status: 0x90, data1: 60, data2: 100, sample_offset: 0 },
            MidiEvent { status: 0x80, data1: 60, data2: 0, sample_offset: 128 },
        ];
        at.queue_midi(events);
        assert!(!at.midi_queue.is_empty());

        let _output = at.process(&[], 2, 256);
        assert!(at.midi_queue.is_empty());
    }

    #[test]
    fn queue_midi_is_threadsafe() {
        let at = AudioThread::new(true);
        let queue = Arc::clone(&at.midi_queue);

        let handle = std::thread::spawn(move || {
            queue.push(MidiEvent { status: 0x90, data1: 72, data2: 127, sample_offset: 0 });
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
    }

    #[test]
    fn set_parameter_is_threadsafe() {
        let at = AudioThread::new(false);
        let queue = Arc::clone(&at.param_queue);

        let handle = std::thread::spawn(move || {
            queue.push(ParameterChange { param_id: 42, value: 1.0 });
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

        let input: Vec<f32> = vec![0.5, 0.6];
        let output = at.process(&input, 2, 4);
        assert_eq!(output.len(), 8);
        assert_eq!(output[0], 0.5);
        assert_eq!(output[1], 0.6);
        assert_eq!(output[2], 0.0);
    }

    #[test]
    fn process_with_real_plugin() {
        use std::path::Path;
        let path = Path::new("/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3");
        if !path.exists() {
            eprintln!("Skipping: ACE Bridge not installed");
            return;
        }

        let (instance, _metadata) = unsafe {
            crate::vst3_loader::load_plugin(path, "audio-test").unwrap()
        };

        let mut at = AudioThread::new(false);
        at.configure(44100.0, 128);
        at.set_plugin(Arc::new(instance));
        at.start();

        let input: Vec<f32> = vec![0.5; 256]; // stereo 128 samples
        let output = at.process(&input, 2, 128);
        assert_eq!(output.len(), 256);
        println!("Real plugin output[0..4]: {:?}", &output[0..4]);

        at.stop();
    }
}
