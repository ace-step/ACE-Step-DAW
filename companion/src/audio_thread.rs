use crossbeam::channel::{self, Receiver, Sender};
use crossbeam::queue::SegQueue;
use std::collections::HashMap;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use vst3::Steinberg::Vst::{
    AudioBusBuffers, AudioBusBuffers__type0, IAudioProcessorTrait, IComponentTrait,
    IEventList, ProcessData, ProcessSetup, ProcessModes_, SymbolicSampleSizes_,
};
use vst3::Steinberg::kResultOk;

use crate::host_impl::{midi_to_vst3_event, EventList};
use crate::vst3_loader::Vst3PluginInstance;

/// A MIDI event to be processed by a VST3 plugin.
#[derive(Debug, Clone, PartialEq)]
pub struct MidiEvent {
    pub status: u8,
    pub data1: u8,
    pub data2: u8,
    pub sample_offset: u32,
}

impl From<&crate::protocol::MidiEvent> for MidiEvent {
    fn from(e: &crate::protocol::MidiEvent) -> Self {
        Self {
            status: e.status,
            data1: e.data1,
            data2: e.data2,
            sample_offset: e.sample_offset,
        }
    }
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
        let mut midi_events = Vec::new();
        while let Some(event) = self.midi_queue.pop() {
            midi_events.push(event);
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
            return self.process_vst3(plugin.clone(), &midi_events, input, channels, samples);
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
        midi_events: &[MidiEvent],
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

        // Convert MIDI events to VST3 events and pack into IEventList.
        // Skip allocation when there are no events (common case).
        let vst3_events: Vec<_> = midi_events
            .iter()
            .filter_map(midi_to_vst3_event)
            .collect();

        let event_list = if !vst3_events.is_empty() {
            Some(EventList::with_events(vst3_events))
        } else {
            None
        };
        let input_events_ptr = event_list
            .as_ref()
            .and_then(|el| el.to_com_ptr::<IEventList>())
            .map(|p| p.as_ptr())
            .unwrap_or(ptr::null_mut());

        let mut process_data = ProcessData {
            processMode: ProcessModes_::kRealtime as i32,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: num_samples as i32,
            numInputs: if self.is_instrument { 0 } else { 1 },
            numOutputs: 1,
            inputs: if self.is_instrument { ptr::null_mut() } else { &mut input_bus },
            outputs: &mut output_bus,
            inputParameterChanges: ptr::null_mut(), // TODO: implement IParameterChanges
            outputParameterChanges: ptr::null_mut(),
            inputEvents: input_events_ptr,
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
// Audio Frame
// =============================================================================

/// A binary audio frame ready to be sent over WebSocket.
///
/// Layout: 4 bytes instance_id length (LE u32) + instance_id bytes + f32 PCM samples (LE).
/// The browser reconstructs the instance_id to route audio to the correct track.
#[derive(Debug, Clone, PartialEq)]
pub struct AudioFrame {
    pub instance_id: String,
    pub samples: Vec<f32>,
}

impl AudioFrame {
    /// Encode this frame into a binary blob suitable for a WebSocket binary message.
    ///
    /// Format: [id_len: u32 LE][instance_id: utf-8 bytes][samples: f32 LE ...]
    pub fn encode(&self) -> Vec<u8> {
        let id_bytes = self.instance_id.as_bytes();
        let id_len = id_bytes.len() as u32;
        let sample_bytes = self.samples.len() * 4;
        let total = 4 + id_bytes.len() + sample_bytes;

        let mut buf = Vec::with_capacity(total);
        buf.extend_from_slice(&id_len.to_le_bytes());
        buf.extend_from_slice(id_bytes);
        for &s in &self.samples {
            buf.extend_from_slice(&s.to_le_bytes());
        }
        buf
    }

    /// Decode a binary blob back into an AudioFrame.
    pub fn decode(data: &[u8]) -> Option<Self> {
        if data.len() < 4 {
            return None;
        }
        let id_len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let id_end = 4 + id_len;
        if data.len() < id_end {
            return None;
        }
        let instance_id = String::from_utf8(data[4..id_end].to_vec()).ok()?;
        let sample_data = &data[id_end..];
        if sample_data.len() % 4 != 0 {
            return None;
        }
        let samples: Vec<f32> = sample_data
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();
        Some(AudioFrame {
            instance_id,
            samples,
        })
    }
}

// =============================================================================
// Audio Stream Manager
// =============================================================================

/// State of a single running stream.
struct StreamState {
    stop_flag: Arc<AtomicBool>,
    midi_queue: Arc<SegQueue<MidiEvent>>,
}

/// Manages audio processing loops for multiple VST3 plugin instances,
/// encoding output as f32 PCM binary frames and sending them to a channel
/// for the WebSocket server to forward to the browser.
pub struct AudioStreamManager {
    /// Channel sender for outgoing audio frames — the WS server reads from the receiver.
    frame_tx: Sender<AudioFrame>,
    /// The receiver side, taken once by the WS server.
    frame_rx: Option<Receiver<AudioFrame>>,
    /// Active streams keyed by instance_id.
    streams: Mutex<HashMap<String, StreamState>>,
}

impl AudioStreamManager {
    pub fn new() -> Self {
        let (tx, rx) = channel::bounded(256);
        Self {
            frame_tx: tx,
            frame_rx: Some(rx),
            streams: Mutex::new(HashMap::new()),
        }
    }

    /// Take the frame receiver. Should be called once by the WebSocket server.
    pub fn take_frame_receiver(&mut self) -> Option<Receiver<AudioFrame>> {
        self.frame_rx.take()
    }

    /// Start an audio stream for the given instance.
    ///
    /// Spawns a dedicated thread that runs a real-time processing loop,
    /// calling `AudioThread::process()` at the cadence dictated by the
    /// sample rate and block size, then sending the output via the channel.
    pub fn start_stream(
        &self,
        instance_id: &str,
        sample_rate: f64,
        block_size: u32,
        plugin: Option<Arc<Vst3PluginInstance>>,
        is_instrument: bool,
    ) -> bool {
        let mut streams = self.streams.lock().unwrap();
        if streams.contains_key(instance_id) {
            return false; // already streaming
        }

        let channels = 2u32; // stereo

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop_flag);
        let tx = self.frame_tx.clone();
        let id = instance_id.to_string();

        // Build the AudioThread that will live inside the processing thread.
        let mut audio_thread = AudioThread::new(is_instrument);
        audio_thread.configure(sample_rate, block_size);
        if let Some(p) = plugin {
            audio_thread.set_plugin(p);
        }
        let midi_queue = Arc::clone(&audio_thread.midi_queue);
        audio_thread.start();

        std::thread::Builder::new()
            .name(format!("audio-stream-{id}"))
            .spawn(move || {
                run_stream_loop(audio_thread, &id, block_size, channels, &stop_clone, &tx);
            })
            .expect("Failed to spawn audio stream thread");

        streams.insert(
            instance_id.to_string(),
            StreamState { stop_flag, midi_queue },
        );

        true
    }

    /// Stop an audio stream for the given instance.
    pub fn stop_stream(&self, instance_id: &str) -> bool {
        let mut streams = self.streams.lock().unwrap();
        if let Some(state) = streams.remove(instance_id) {
            state.stop_flag.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }

    /// Send MIDI events to the audio thread for a given instance.
    ///
    /// Events are queued and will be picked up on the next `process()` call.
    /// Returns `false` if no stream exists for the instance.
    pub fn send_midi(&self, instance_id: &str, events: Vec<MidiEvent>) -> bool {
        let streams = self.streams.lock().unwrap();
        if let Some(state) = streams.get(instance_id) {
            for event in events {
                state.midi_queue.push(event);
            }
            true
        } else {
            false
        }
    }

    /// Check if a stream is active for the given instance.
    pub fn is_streaming(&self, instance_id: &str) -> bool {
        self.streams.lock().unwrap().contains_key(instance_id)
    }

    /// Return the number of active streams.
    pub fn stream_count(&self) -> usize {
        self.streams.lock().unwrap().len()
    }
}

/// The real-time audio processing loop that runs in a dedicated thread.
///
/// Owns the `AudioThread` and calls `process()` every block, encoding the
/// output as an `AudioFrame` and sending it to the WebSocket via the channel.
fn run_stream_loop(
    mut audio_thread: AudioThread,
    instance_id: &str,
    block_size: u32,
    channels: u32,
    stop_flag: &AtomicBool,
    tx: &Sender<AudioFrame>,
) {
    let sample_rate = audio_thread.config().sample_rate;
    let block_duration = Duration::from_secs_f64(block_size as f64 / sample_rate);
    let total_samples = (channels * block_size) as usize;
    let input = vec![0.0f32; total_samples];

    tracing::info!(
        instance_id,
        sample_rate,
        block_size,
        "Audio stream loop started"
    );

    loop {
        let start = Instant::now();

        if stop_flag.load(Ordering::Acquire) {
            break;
        }

        let samples = audio_thread.process(&input, channels, block_size);

        let frame = AudioFrame {
            instance_id: instance_id.to_string(),
            samples,
        };

        // Non-blocking send — if the channel is full, drop the frame
        // rather than blocking the audio thread.
        let _ = tx.try_send(frame);

        let elapsed = start.elapsed();
        if elapsed < block_duration {
            std::thread::sleep(block_duration - elapsed);
        }
    }

    audio_thread.stop();
    tracing::info!(instance_id, "Audio stream loop stopped");
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

    // =========================================================================
    // AudioFrame tests
    // =========================================================================

    #[test]
    fn audio_frame_encode_decode_roundtrip() {
        let frame = AudioFrame {
            instance_id: "inst-42".into(),
            samples: vec![0.1, 0.2, -0.3, 0.0],
        };
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.instance_id, "inst-42");
        assert_eq!(decoded.samples.len(), 4);
        assert!((decoded.samples[0] - 0.1).abs() < f32::EPSILON);
        assert!((decoded.samples[2] - (-0.3)).abs() < f32::EPSILON);
    }

    #[test]
    fn audio_frame_encode_empty_samples() {
        let frame = AudioFrame {
            instance_id: "x".into(),
            samples: vec![],
        };
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.instance_id, "x");
        assert!(decoded.samples.is_empty());
    }

    #[test]
    fn audio_frame_decode_too_short_returns_none() {
        assert!(AudioFrame::decode(&[]).is_none());
        assert!(AudioFrame::decode(&[1, 0, 0]).is_none());
    }

    #[test]
    fn audio_frame_decode_bad_id_len_returns_none() {
        // id_len says 100 but data is only 8 bytes total
        let data = [100, 0, 0, 0, 0, 0, 0, 0];
        assert!(AudioFrame::decode(&data).is_none());
    }

    #[test]
    fn audio_frame_decode_unaligned_samples_returns_none() {
        // Valid id but sample data is 3 bytes (not multiple of 4)
        let mut data = vec![1u8, 0, 0, 0, b'x'];
        data.extend_from_slice(&[0, 0, 0]); // 3 bytes — not aligned
        assert!(AudioFrame::decode(&data).is_none());
    }

    // =========================================================================
    // AudioStreamManager tests
    // =========================================================================

    #[test]
    fn stream_manager_start_and_stop() {
        let manager = AudioStreamManager::new();
        assert_eq!(manager.stream_count(), 0);

        let started = manager.start_stream("inst-1", 44100.0, 512, None, false);
        assert!(started);
        assert!(manager.is_streaming("inst-1"));
        assert_eq!(manager.stream_count(), 1);

        let stopped = manager.stop_stream("inst-1");
        assert!(stopped);
        assert!(!manager.is_streaming("inst-1"));
        assert_eq!(manager.stream_count(), 0);
    }

    #[test]
    fn stream_manager_duplicate_start_returns_false() {
        let manager = AudioStreamManager::new();
        assert!(manager.start_stream("inst-1", 44100.0, 512, None, false));
        assert!(!manager.start_stream("inst-1", 48000.0, 256, None, false));
        assert_eq!(manager.stream_count(), 1);

        manager.stop_stream("inst-1");
    }

    #[test]
    fn stream_manager_stop_nonexistent_returns_false() {
        let manager = AudioStreamManager::new();
        assert!(!manager.stop_stream("nonexistent"));
    }

    #[test]
    fn stream_manager_produces_frames() {
        let mut manager = AudioStreamManager::new();
        let rx = manager.take_frame_receiver().unwrap();

        // Use a high sample rate and small block so frames arrive quickly
        manager.start_stream("inst-1", 44100.0, 64, None, true);

        // Wait for at least one frame
        let frame = rx.recv_timeout(Duration::from_millis(500));
        assert!(frame.is_ok(), "Expected to receive an audio frame");
        let frame = frame.unwrap();
        assert_eq!(frame.instance_id, "inst-1");
        // Stereo * 64 samples = 128 f32 values
        assert_eq!(frame.samples.len(), 128);
        // Stub instrument produces silence
        assert!(frame.samples.iter().all(|&s| s == 0.0));

        manager.stop_stream("inst-1");
    }

    #[test]
    fn stream_manager_take_receiver_only_once() {
        let mut manager = AudioStreamManager::new();
        assert!(manager.take_frame_receiver().is_some());
        assert!(manager.take_frame_receiver().is_none());
    }

    #[test]
    fn stream_manager_multiple_instances() {
        let mut manager = AudioStreamManager::new();
        let rx = manager.take_frame_receiver().unwrap();

        manager.start_stream("inst-a", 44100.0, 64, None, true);
        manager.start_stream("inst-b", 44100.0, 64, None, false);
        assert_eq!(manager.stream_count(), 2);

        // Collect frames for a short window
        std::thread::sleep(Duration::from_millis(100));
        let mut ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        while let Ok(frame) = rx.try_recv() {
            ids.insert(frame.instance_id.clone());
        }
        assert!(ids.contains("inst-a"), "Expected frames from inst-a");
        assert!(ids.contains("inst-b"), "Expected frames from inst-b");

        manager.stop_stream("inst-a");
        manager.stop_stream("inst-b");
    }

    #[test]
    fn stream_manager_send_midi_to_active_stream() {
        let manager = AudioStreamManager::new();
        manager.start_stream("inst-1", 44100.0, 512, None, true);

        let events = vec![
            MidiEvent { status: 0x90, data1: 60, data2: 100, sample_offset: 0 },
            MidiEvent { status: 0x80, data1: 60, data2: 0, sample_offset: 128 },
        ];
        let sent = manager.send_midi("inst-1", events);
        assert!(sent, "send_midi should return true for active stream");

        manager.stop_stream("inst-1");
    }

    #[test]
    fn stream_manager_send_midi_to_nonexistent_stream() {
        let manager = AudioStreamManager::new();
        let events = vec![
            MidiEvent { status: 0x90, data1: 60, data2: 100, sample_offset: 0 },
        ];
        let sent = manager.send_midi("nonexistent", events);
        assert!(!sent, "send_midi should return false for nonexistent stream");
    }
}
