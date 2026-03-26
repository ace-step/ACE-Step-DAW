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

/// Information about an output bus for multi-output processing.
#[derive(Debug, Clone)]
pub struct OutputBusConfig {
    /// Number of audio channels on this bus.
    pub channels: u32,
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
    /// Output bus configuration; defaults to a single stereo bus.
    output_busses: Vec<OutputBusConfig>,
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
            output_busses: vec![OutputBusConfig { channels: 2 }],
        }
    }

    /// Set the output bus configuration for multi-output plugins.
    pub fn set_output_busses(&mut self, busses: Vec<OutputBusConfig>) {
        if busses.is_empty() {
            self.output_busses = vec![OutputBusConfig { channels: 2 }];
        } else {
            self.output_busses = busses;
        }
    }

    /// Return the output bus configuration.
    pub fn output_busses(&self) -> &[OutputBusConfig] {
        &self.output_busses
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

    /// Process audio through the VST3 plugin, returning output for bus 0 only.
    ///
    /// Input/output are interleaved f32 samples. If a real plugin is attached,
    /// audio is processed through `IAudioProcessor::process()`. Otherwise falls
    /// back to stub behavior (instruments=silence, effects=passthrough).
    pub fn process(&mut self, input: &[f32], channels: u32, samples: u32) -> Vec<f32> {
        let busses = self.process_multi(input, channels, samples);
        busses.into_iter().next().unwrap_or_default()
    }

    /// Process audio and return output for all output busses.
    ///
    /// Returns a Vec of interleaved f32 sample buffers, one per output bus.
    /// Bus 0 is always the main output.
    pub fn process_multi(&mut self, input: &[f32], channels: u32, samples: u32) -> Vec<Vec<f32>> {
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
            return vec![vec![0.0f32; total]];
        }

        // Try real VST3 processing with multi-output
        if let Some(ref plugin) = self.plugin {
            return self.process_vst3_multi(plugin.clone(), &midi_events, input, channels, samples);
        }

        // Stub fallback (single bus only)
        let bus0 = if self.is_instrument {
            vec![0.0f32; total]
        } else if input.len() >= total {
            input[..total].to_vec()
        } else {
            let mut output = input.to_vec();
            output.resize(total, 0.0);
            output
        };
        vec![bus0]
    }

    /// Process audio through the real VST3 plugin, returning all output busses.
    fn process_vst3_multi(
        &self,
        plugin: Arc<Vst3PluginInstance>,
        midi_events: &[MidiEvent],
        input: &[f32],
        channels: u32,
        samples: u32,
    ) -> Vec<Vec<f32>> {
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

        // Build raw pointer arrays for input AudioBusBuffers
        let mut input_ptrs: Vec<*mut f32> = input_channels
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

        // Create per-bus output channel buffers and AudioBusBuffers.
        // `self.output_busses` is guaranteed non-empty (set_output_busses enforces this).
        let num_output_busses = self.output_busses.len();
        let mut all_output_channels: Vec<Vec<Vec<f32>>> = Vec::with_capacity(num_output_busses);
        let mut all_output_ptrs: Vec<Vec<*mut f32>> = Vec::with_capacity(num_output_busses);

        for bus in &self.output_busses {
            let bus_ch = bus.channels as usize;
            all_output_channels.push(vec![vec![0.0; num_samples]; bus_ch]);
        }

        // Build pointer arrays — must be done after all_output_channels is fully populated
        for bus_channels in &mut all_output_channels {
            let ptrs: Vec<*mut f32> = bus_channels
                .iter_mut()
                .map(|ch| ch.as_mut_ptr())
                .collect();
            all_output_ptrs.push(ptrs);
        }

        let mut output_busses: Vec<AudioBusBuffers> = all_output_ptrs
            .iter_mut()
            .enumerate()
            .map(|(i, ptrs)| {
                let bus_ch = if i < self.output_busses.len() {
                    self.output_busses[i].channels as i32
                } else {
                    num_channels as i32
                };
                AudioBusBuffers {
                    numChannels: bus_ch,
                    silenceFlags: 0,
                    __field0: AudioBusBuffers__type0 {
                        channelBuffers32: ptrs.as_mut_ptr(),
                    },
                }
            })
            .collect();

        // Convert MIDI events to VST3 events and pack into IEventList.
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
            numOutputs: output_busses.len() as i32,
            inputs: if self.is_instrument { ptr::null_mut() } else { &mut input_bus },
            outputs: output_busses.as_mut_ptr(),
            inputParameterChanges: ptr::null_mut(), // TODO: implement IParameterChanges
            outputParameterChanges: ptr::null_mut(),
            inputEvents: input_events_ptr,
            outputEvents: ptr::null_mut(),
            processContext: ptr::null_mut(),
        };

        let result = unsafe { plugin.processor.process(&mut process_data) };
        if result != kResultOk {
            tracing::warn!(result, "IAudioProcessor::process returned non-OK");
            return vec![vec![0.0f32; total]];
        }

        // Re-interleave each bus's output
        let mut results = Vec::with_capacity(all_output_channels.len());
        for bus_channels in &all_output_channels {
            let bus_ch = bus_channels.len();
            let bus_total = bus_ch * num_samples;
            let mut interleaved = vec![0.0f32; bus_total];
            for s in 0..num_samples {
                for ch in 0..bus_ch {
                    interleaved[s * bus_ch + ch] = bus_channels[ch][s];
                }
            }
            results.push(interleaved);
        }

        results
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
    /// Output bus index (0 = main, 1+ = auxiliary busses).
    pub bus_index: u8,
    pub samples: Vec<f32>,
}

impl AudioFrame {
    /// Encode this frame into a binary blob suitable for a WebSocket binary message.
    ///
    /// Format: [id_len: u32 LE][instance_id: utf-8 bytes][bus_index: u8][samples: f32 LE ...]
    pub fn encode(&self) -> Vec<u8> {
        let id_bytes = self.instance_id.as_bytes();
        let id_len = id_bytes.len() as u32;
        let sample_bytes = self.samples.len() * 4;
        let total = 4 + id_bytes.len() + 1 + sample_bytes;

        let mut buf = Vec::with_capacity(total);
        buf.extend_from_slice(&id_len.to_le_bytes());
        buf.extend_from_slice(id_bytes);
        buf.push(self.bus_index);
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
        if data.len() < id_end + 1 {
            return None;
        }
        let instance_id = String::from_utf8(data[4..id_end].to_vec()).ok()?;
        let bus_index = data[id_end];
        let sample_data = &data[id_end + 1..];
        if sample_data.len() % 4 != 0 {
            return None;
        }
        let samples: Vec<f32> = sample_data
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect();
        Some(AudioFrame {
            instance_id,
            bus_index,
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
    /// Input audio buffer for effect processing. The browser sends audio frames
    /// which are queued here and consumed by the processing loop.
    input_audio: Arc<SegQueue<Vec<f32>>>,
    /// Whether this stream is an effect (needs input audio) or instrument (generates audio).
    is_instrument: bool,
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
        self.start_stream_multi(instance_id, sample_rate, block_size, plugin, is_instrument, None)
    }

    /// Start an audio stream with multi-output bus configuration.
    ///
    /// If `output_busses` is None or empty, defaults to a single stereo bus.
    pub fn start_stream_multi(
        &self,
        instance_id: &str,
        sample_rate: f64,
        block_size: u32,
        plugin: Option<Arc<Vst3PluginInstance>>,
        is_instrument: bool,
        output_busses: Option<Vec<OutputBusConfig>>,
    ) -> bool {
        let mut streams = self.streams.lock().unwrap();
        if streams.contains_key(instance_id) {
            return false; // already streaming
        }

        let channels = 2u32; // stereo for input/main bus

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop_flag);
        let tx = self.frame_tx.clone();
        let id = instance_id.to_string();
        let input_audio: Arc<SegQueue<Vec<f32>>> = Arc::new(SegQueue::new());
        let input_audio_clone = Arc::clone(&input_audio);

        // Build the AudioThread that will live inside the processing thread.
        let mut audio_thread = AudioThread::new(is_instrument);
        audio_thread.configure(sample_rate, block_size);
        if let Some(busses) = output_busses {
            audio_thread.set_output_busses(busses);
        }
        if let Some(p) = plugin {
            audio_thread.set_plugin(p);
        }
        let midi_queue = Arc::clone(&audio_thread.midi_queue);
        audio_thread.start();

        std::thread::Builder::new()
            .name(format!("audio-stream-{id}"))
            .spawn(move || {
                run_stream_loop(
                    audio_thread,
                    &id,
                    block_size,
                    channels,
                    &stop_clone,
                    &tx,
                    &input_audio_clone,
                );
            })
            .expect("Failed to spawn audio stream thread");

        streams.insert(
            instance_id.to_string(),
            StreamState {
                stop_flag,
                midi_queue,
                input_audio,
                is_instrument,
            },
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

    /// Send input audio samples to an effect stream for processing.
    ///
    /// The samples are interleaved f32 PCM (e.g. L R L R ...).
    /// Returns `false` if no stream exists or the instance is an instrument.
    pub fn send_audio(&self, instance_id: &str, samples: Vec<f32>) -> bool {
        let streams = self.streams.lock().unwrap();
        if let Some(state) = streams.get(instance_id) {
            if state.is_instrument {
                return false; // instruments don't accept input audio
            }
            state.input_audio.push(samples);
            true
        } else {
            false
        }
    }

    /// Check if an instance is an effect (accepts input audio).
    pub fn is_effect(&self, instance_id: &str) -> bool {
        let streams = self.streams.lock().unwrap();
        streams
            .get(instance_id)
            .map(|s| !s.is_instrument)
            .unwrap_or(false)
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
    input_audio: &SegQueue<Vec<f32>>,
) {
    let sample_rate = audio_thread.config().sample_rate;
    let block_duration = Duration::from_secs_f64(block_size as f64 / sample_rate);
    let total_samples = (channels * block_size) as usize;
    let silence = vec![0.0f32; total_samples];
    let is_effect = !audio_thread.is_instrument;

    tracing::info!(
        instance_id,
        sample_rate,
        block_size,
        is_effect,
        output_busses = audio_thread.output_busses().len(),
        "Audio stream loop started"
    );

    // Accumulator for effect input — partial frames are kept between iterations.
    let mut input_buf: Vec<f32> = Vec::new();
    let id_owned = instance_id.to_string();

    loop {
        let start = Instant::now();

        if stop_flag.load(Ordering::Acquire) {
            break;
        }

        let input: &[f32] = if is_effect {
            // Drain all queued input chunks into the accumulator.
            while let Some(chunk) = input_audio.pop() {
                input_buf.extend_from_slice(&chunk);
            }

            if input_buf.len() >= total_samples {
                &input_buf[..total_samples]
            } else {
                let elapsed = start.elapsed();
                if elapsed < block_duration {
                    std::thread::sleep(block_duration - elapsed);
                }
                continue;
            }
        } else {
            &silence
        };

        let bus_outputs = audio_thread.process_multi(input, channels, block_size);

        // For effects, discard the consumed samples after processing.
        if is_effect {
            input_buf.drain(..total_samples);
        }

        // Send one AudioFrame per output bus
        for (bus_idx, samples) in bus_outputs.into_iter().enumerate() {
            let frame = AudioFrame {
                instance_id: id_owned.clone(),
                bus_index: bus_idx as u8,
                samples,
            };

            // Non-blocking send — if the channel is full, drop the frame
            // rather than blocking the audio thread.
            let _ = tx.try_send(frame);
        }

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
            bus_index: 0,
            samples: vec![0.1, 0.2, -0.3, 0.0],
        };
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.instance_id, "inst-42");
        assert_eq!(decoded.bus_index, 0);
        assert_eq!(decoded.samples.len(), 4);
        assert!((decoded.samples[0] - 0.1).abs() < f32::EPSILON);
        assert!((decoded.samples[2] - (-0.3)).abs() < f32::EPSILON);
    }

    #[test]
    fn audio_frame_encode_decode_with_bus_index() {
        let frame = AudioFrame {
            instance_id: "inst-99".into(),
            bus_index: 3,
            samples: vec![0.5, -0.5],
        };
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.instance_id, "inst-99");
        assert_eq!(decoded.bus_index, 3);
        assert_eq!(decoded.samples.len(), 2);
        assert!((decoded.samples[0] - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    fn audio_frame_encode_empty_samples() {
        let frame = AudioFrame {
            instance_id: "x".into(),
            bus_index: 0,
            samples: vec![],
        };
        let encoded = frame.encode();
        let decoded = AudioFrame::decode(&encoded).unwrap();
        assert_eq!(decoded.instance_id, "x");
        assert_eq!(decoded.bus_index, 0);
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
    // Multi-output bus tests
    // =========================================================================

    #[test]
    fn output_bus_config_defaults_to_single_stereo() {
        let at = AudioThread::new(true);
        assert_eq!(at.output_busses().len(), 1);
        assert_eq!(at.output_busses()[0].channels, 2);
    }

    #[test]
    fn set_output_busses_configures_multiple() {
        let mut at = AudioThread::new(true);
        at.set_output_busses(vec![
            OutputBusConfig { channels: 2 },
            OutputBusConfig { channels: 2 },
            OutputBusConfig { channels: 1 },
        ]);
        assert_eq!(at.output_busses().len(), 3);
        assert_eq!(at.output_busses()[2].channels, 1);
    }

    #[test]
    fn set_output_busses_empty_defaults_to_stereo() {
        let mut at = AudioThread::new(true);
        at.set_output_busses(vec![]);
        assert_eq!(at.output_busses().len(), 1);
        assert_eq!(at.output_busses()[0].channels, 2);
    }

    #[test]
    fn process_multi_returns_single_bus_for_stub() {
        let mut at = AudioThread::new(true);
        at.configure(44100.0, 4);
        at.start();

        let input: Vec<f32> = vec![1.0; 8];
        let busses = at.process_multi(&input, 2, 4);
        assert_eq!(busses.len(), 1);
        assert_eq!(busses[0].len(), 8);
        assert!(busses[0].iter().all(|&s| s == 0.0)); // instrument = silence
    }

    #[test]
    fn process_multi_effect_passthrough() {
        let mut at = AudioThread::new(false);
        at.configure(44100.0, 4);
        at.start();

        let input: Vec<f32> = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let busses = at.process_multi(&input, 2, 4);
        assert_eq!(busses.len(), 1);
        assert_eq!(busses[0], input);
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

        // Feed input audio to the effect instance so it produces output.
        let block = vec![0.5f32; 128]; // stereo * 64 samples
        for _ in 0..5 {
            manager.send_audio("inst-b", block.clone());
        }

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

    // =========================================================================
    // Effect audio input routing tests
    // =========================================================================

    #[test]
    fn send_audio_to_effect_stream() {
        let mut manager = AudioStreamManager::new();
        let rx = manager.take_frame_receiver().unwrap();

        // Start an effect stream (is_instrument = false)
        manager.start_stream("fx-1", 44100.0, 64, None, false);

        // Send exactly one block of stereo audio (2 channels * 64 samples = 128 f32s)
        let input = vec![0.25f32; 128];
        let sent = manager.send_audio("fx-1", input.clone());
        assert!(sent, "send_audio should succeed for effect stream");

        // Wait for the effect to process and produce output
        let frame = rx.recv_timeout(Duration::from_millis(500));
        assert!(frame.is_ok(), "Expected output frame from effect stream");
        let frame = frame.unwrap();
        assert_eq!(frame.instance_id, "fx-1");
        assert_eq!(frame.samples.len(), 128);
        // Stub effect does passthrough — output should match input
        assert!((frame.samples[0] - 0.25).abs() < f32::EPSILON);

        manager.stop_stream("fx-1");
    }

    #[test]
    fn send_audio_to_instrument_returns_false() {
        let manager = AudioStreamManager::new();
        manager.start_stream("synth-1", 44100.0, 64, None, true);

        let sent = manager.send_audio("synth-1", vec![0.5; 128]);
        assert!(!sent, "send_audio should return false for instrument streams");

        manager.stop_stream("synth-1");
    }

    #[test]
    fn send_audio_to_nonexistent_stream_returns_false() {
        let manager = AudioStreamManager::new();
        let sent = manager.send_audio("nonexistent", vec![0.5; 128]);
        assert!(!sent, "send_audio should return false for nonexistent stream");
    }

    #[test]
    fn is_effect_returns_correct_value() {
        let manager = AudioStreamManager::new();

        manager.start_stream("fx-1", 44100.0, 64, None, false);
        manager.start_stream("synth-1", 44100.0, 64, None, true);

        assert!(manager.is_effect("fx-1"), "Effect stream should report is_effect=true");
        assert!(!manager.is_effect("synth-1"), "Instrument stream should report is_effect=false");
        assert!(!manager.is_effect("nonexistent"), "Nonexistent stream should report is_effect=false");

        manager.stop_stream("fx-1");
        manager.stop_stream("synth-1");
    }

    #[test]
    fn effect_stream_without_input_does_not_produce_frames() {
        let mut manager = AudioStreamManager::new();
        let rx = manager.take_frame_receiver().unwrap();

        // Start an effect but don't send any audio input
        manager.start_stream("fx-1", 44100.0, 64, None, false);

        // Wait briefly — effect should NOT produce frames without input
        std::thread::sleep(Duration::from_millis(50));
        let result = rx.try_recv();
        assert!(result.is_err(), "Effect should not produce frames without input audio");

        manager.stop_stream("fx-1");
    }

    #[test]
    fn effect_accumulates_partial_input() {
        let mut manager = AudioStreamManager::new();
        let rx = manager.take_frame_receiver().unwrap();

        // Block needs 128 samples (stereo * 64), send in two halves
        manager.start_stream("fx-1", 44100.0, 64, None, false);

        manager.send_audio("fx-1", vec![0.1f32; 64]); // first half
        std::thread::sleep(Duration::from_millis(20));
        // No frame yet — not enough data
        assert!(rx.try_recv().is_err(), "Should not produce frame from partial input");

        manager.send_audio("fx-1", vec![0.2f32; 64]); // second half completes a block

        let frame = rx.recv_timeout(Duration::from_millis(500));
        assert!(frame.is_ok(), "Expected output frame after completing a block");
        let frame = frame.unwrap();
        assert_eq!(frame.instance_id, "fx-1");
        assert_eq!(frame.samples.len(), 128);

        manager.stop_stream("fx-1");
    }
}
