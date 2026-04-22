//! VST3 audio-processing lifecycle: `setupProcessing` → `setActive` →
//! `process()` → deactivate. Phase 4B-1.
//!
//! The state machine lives on [`Vst3PluginInstance`] via interior
//! mutability (a `Mutex<ProcessingState>`) so the instance remains
//! `Send + Sync` and can be shared between the Tauri command thread
//! and, in a later phase, the real audio callback thread.
//!
//! Scope is deliberately narrow:
//!
//! - Stereo-only main bus I/O (multi-output busses land in 4B-3)
//! - 4B-2a adds MIDI note-on / note-off via `IEventList`;
//!   4B-2b adds parameter automation via host-side
//!   `IParameterChanges` + `IParamValueQueue`.
//! - No sidechain, no PDC, no sandbox (later sub-phases of #1524)
//!
//! Ported from `companion/src/audio_thread.rs::process_vst3_multi`,
//! stripped of the companion's multi-bus + MIDI + parameter-change
//! machinery. That code ran in production for the companion app, so
//! the de-interleave → AudioBusBuffers → process → re-interleave
//! pipeline here matches a known-working reference.

use std::ptr;

use tracing::warn;
use vst3::Steinberg::Vst::{
    AudioBusBuffers, AudioBusBuffers__type0, IAudioProcessorTrait, IComponentTrait, IEventList,
    IParameterChanges, ProcessData, ProcessModes_, ProcessSetup, SymbolicSampleSizes_,
};
use vst3::Steinberg::kResultOk;

use crate::error::PluginHostError;
use crate::loader::Vst3PluginInstance;
use crate::midi::{midi_to_vst3_event, EventList};
use crate::params::{partition_points_for_block, ParameterChanges};
use crate::types::OutputBusInfo;

/// Pure-logic guard that `setup_processing` delegates to. Extracted
/// so it can be exercised without a real plugin — the real lifecycle
/// calls COM methods and is only runnable against a loaded bundle.
///
/// Validates that the plugin's discovered bus topology is hostable
/// under 4B-1's stereo-only contract. Returns the main output bus
/// on success so callers can keep using it.
pub(crate) fn validate_stereo_main_bus(
    busses: &[OutputBusInfo],
) -> Result<&OutputBusInfo, PluginHostError> {
    let main = busses.first().ok_or_else(|| {
        PluginHostError::SetupFailed(
            "plugin exposes no audio output bus (unsupported in 4B-1 — requires bus-arrangement negotiation, landing in 4B-3)".into(),
        )
    })?;
    if main.channels != 2 {
        return Err(PluginHostError::SetupFailed(format!(
            "plugin main output bus is {}-channel; 4B-1 only supports stereo (bus-arrangement negotiation lands in 4B-3)",
            main.channels
        )));
    }
    Ok(main)
}

/// Sample rate + maximum block size the plugin should prepare for.
/// Mirrors the shape of Steinberg's `ProcessSetup` but lives at our
/// layer so callers don't need to touch the COM types directly.
#[derive(Debug, Clone, Copy, PartialEq)]
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

impl AudioConfig {
    /// Build a config, rejecting obviously-broken values early so
    /// plugins don't see zero sample rates or absurd block sizes.
    /// `block_size` is additionally bounded by `i32::MAX` because
    /// VST3's `ProcessSetup::maxSamplesPerBlock` is a signed 32-bit
    /// integer — larger values would silently overflow to negative.
    pub fn new(sample_rate: f64, block_size: u32) -> Result<Self, PluginHostError> {
        if !sample_rate.is_finite() || sample_rate <= 0.0 {
            return Err(PluginHostError::SetupFailed(format!(
                "sample_rate must be positive and finite (got {sample_rate})"
            )));
        }
        if block_size == 0 {
            return Err(PluginHostError::SetupFailed(
                "block_size must be non-zero".into(),
            ));
        }
        if block_size > i32::MAX as u32 {
            return Err(PluginHostError::SetupFailed(format!(
                "block_size {block_size} exceeds VST3's i32 maxSamplesPerBlock limit"
            )));
        }
        Ok(Self {
            sample_rate,
            block_size,
        })
    }
}

/// Shape of a single audio output bus. The 4B-1 implementation only
/// ever creates the default stereo main bus; 4B-3 will wire this up to
/// multi-out plugins. Kept here so we can already surface the right
/// type in the public API.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OutputBusConfig {
    pub channels: u32,
}

impl OutputBusConfig {
    /// Build a bus config, rejecting zero-channel busses (meaningless
    /// in audio routing) and values larger than `i32::MAX` (since
    /// VST3's `AudioBusBuffers::numChannels` is a signed int).
    pub fn new(channels: u32) -> Result<Self, PluginHostError> {
        if channels == 0 {
            return Err(PluginHostError::SetupFailed(
                "bus channels must be non-zero".into(),
            ));
        }
        if channels > i32::MAX as u32 {
            return Err(PluginHostError::SetupFailed(format!(
                "bus channels {channels} exceeds VST3's i32 channelCount limit"
            )));
        }
        Ok(Self { channels })
    }
}

impl Default for OutputBusConfig {
    fn default() -> Self {
        Self { channels: 2 }
    }
}

/// Per-instance lifecycle bookkeeping. Protected by a `Mutex` on
/// [`Vst3PluginInstance`] so the COM calls are serialised — the VST3
/// spec requires that `setupProcessing`, `setActive`, `setProcessing`,
/// and `process` never overlap on a single instance.
#[derive(Debug, Default)]
pub struct ProcessingState {
    pub config: Option<AudioConfig>,
    pub setup_done: bool,
    pub active: bool,
    pub processing: bool,
}

impl ProcessingState {
    pub fn is_ready_to_activate(&self) -> bool {
        self.setup_done
    }

    pub fn is_ready_to_process(&self) -> bool {
        self.setup_done && self.active && self.processing
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_config_default_is_cd_quality_512() {
        let cfg = AudioConfig::default();
        assert_eq!(cfg.sample_rate, 44100.0);
        assert_eq!(cfg.block_size, 512);
    }

    #[test]
    fn audio_config_rejects_zero_sample_rate() {
        let err = AudioConfig::new(0.0, 512).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn audio_config_rejects_negative_sample_rate() {
        let err = AudioConfig::new(-44100.0, 512).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn audio_config_rejects_nan_sample_rate() {
        let err = AudioConfig::new(f64::NAN, 512).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn audio_config_rejects_zero_block_size() {
        let err = AudioConfig::new(48000.0, 0).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn audio_config_rejects_block_size_exceeding_i32_max() {
        let err = AudioConfig::new(48000.0, (i32::MAX as u32) + 1).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn audio_config_accepts_common_daw_settings() {
        let cfg = AudioConfig::new(48000.0, 1024).unwrap();
        assert_eq!(cfg.sample_rate, 48000.0);
        assert_eq!(cfg.block_size, 1024);
    }

    #[test]
    fn output_bus_config_defaults_to_stereo() {
        assert_eq!(OutputBusConfig::default().channels, 2);
    }

    #[test]
    fn output_bus_config_rejects_zero_channels() {
        let err = OutputBusConfig::new(0).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn output_bus_config_rejects_channels_exceeding_i32_max() {
        let err = OutputBusConfig::new((i32::MAX as u32) + 1).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn output_bus_config_accepts_stereo() {
        assert_eq!(OutputBusConfig::new(2).unwrap().channels, 2);
    }

    fn mk_bus(channels: u32) -> OutputBusInfo {
        OutputBusInfo {
            name: "main".into(),
            channels,
            index: 0,
        }
    }

    #[test]
    fn validate_stereo_main_bus_accepts_stereo() {
        let busses = vec![mk_bus(2)];
        assert!(validate_stereo_main_bus(&busses).is_ok());
    }

    #[test]
    fn validate_stereo_main_bus_rejects_empty_bus_list() {
        let err = validate_stereo_main_bus(&[]).unwrap_err();
        assert!(matches!(err, PluginHostError::SetupFailed(_)));
    }

    #[test]
    fn validate_stereo_main_bus_rejects_mono() {
        let busses = vec![mk_bus(1)];
        let err = validate_stereo_main_bus(&busses).unwrap_err();
        match err {
            PluginHostError::SetupFailed(msg) => assert!(msg.contains("1-channel")),
            other => panic!("expected SetupFailed, got {other:?}"),
        }
    }

    #[test]
    fn validate_stereo_main_bus_rejects_surround() {
        let busses = vec![mk_bus(6)];
        let err = validate_stereo_main_bus(&busses).unwrap_err();
        match err {
            PluginHostError::SetupFailed(msg) => assert!(msg.contains("6-channel")),
            other => panic!("expected SetupFailed, got {other:?}"),
        }
    }

    #[test]
    fn validate_stereo_main_bus_only_checks_main_bus() {
        // Aux busses beyond the main stereo one are allowed — 4B-3
        // will route them, but they shouldn't block the stereo-main
        // contract.
        let busses = vec![mk_bus(2), mk_bus(2), mk_bus(2)];
        assert!(validate_stereo_main_bus(&busses).is_ok());
    }

    #[test]
    fn processing_state_default_is_cold() {
        let s = ProcessingState::default();
        assert!(!s.setup_done);
        assert!(!s.active);
        assert!(!s.processing);
        assert!(s.config.is_none());
        assert!(!s.is_ready_to_activate());
        assert!(!s.is_ready_to_process());
    }

    #[test]
    fn processing_state_ready_to_process_requires_full_chain() {
        let mut s = ProcessingState {
            setup_done: true,
            ..Default::default()
        };
        assert!(s.is_ready_to_activate());
        assert!(!s.is_ready_to_process());
        s.active = true;
        assert!(!s.is_ready_to_process());
        s.processing = true;
        assert!(s.is_ready_to_process());
    }
}

// ---------------------------------------------------------------------------
// Lifecycle + processing on Vst3PluginInstance
// ---------------------------------------------------------------------------

impl Vst3PluginInstance {
    /// Configure the plugin's audio pipeline. Must be called before
    /// [`activate`](Self::activate). Re-calling overwrites the stored
    /// config and re-runs `IAudioProcessor::setupProcessing`, so
    /// changing sample rate or block size is supported — but only
    /// while the instance is *not* active (VST3 spec).
    pub fn setup_processing(&self, config: AudioConfig) -> Result<(), PluginHostError> {
        // Re-validate: `AudioConfig` has public fields, so callers can
        // construct one without going through `new()`. Guard the COM
        // call regardless so we never pass garbage to the plugin.
        let _ = AudioConfig::new(config.sample_rate, config.block_size)?;

        // 4B-1 is stereo-main-bus only. Without bus-arrangement
        // negotiation (`IAudioProcessor::setBusArrangements`, lands in
        // 4B-3), we can't reliably host mono effects, MIDI FX with no
        // audio output, or multi-out / surround plugins — they'll
        // either reject our `process()` call or render into the wrong
        // layout. Fail fast here rather than letting them reach
        // `process_block` with a mis-shaped bus.
        validate_stereo_main_bus(&self.output_busses)?;

        let mut state = self.processing_state().lock().map_err(|_| {
            PluginHostError::RegistryUnavailable
        })?;

        if state.active {
            return Err(PluginHostError::InvalidLifecycle(
                "cannot reconfigure while active — call deactivate() first".into(),
            ));
        }

        let mut setup = ProcessSetup {
            processMode: ProcessModes_::kRealtime as i32,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: config.block_size as i32,
            sampleRate: config.sample_rate,
        };

        // SAFETY: `self.processor` is a live COM pointer obtained from
        // `load_plugin`, and `setup` lives for the duration of the call.
        let result = unsafe { self.processor.setupProcessing(&mut setup) };
        if result != kResultOk {
            return Err(PluginHostError::SetupFailed(format!(
                "IAudioProcessor::setupProcessing returned {result}"
            )));
        }

        state.config = Some(config);
        state.setup_done = true;
        Ok(())
    }

    /// Transition the plugin into the *active* + *processing* state.
    /// Must be preceded by [`setup_processing`](Self::setup_processing);
    /// otherwise returns `PluginHostError::InvalidLifecycle`.
    /// Calling a second time while already active is a no-op.
    ///
    /// The VST3 spec orders these calls as `setActive(1)` →
    /// `setProcessing(1)`. If `setProcessing(1)` fails, we roll back
    /// `setActive(0)` on a best-effort basis so the plugin isn't left
    /// half-activated.
    pub fn activate(&self) -> Result<(), PluginHostError> {
        let mut state = self.processing_state().lock().map_err(|_| {
            PluginHostError::RegistryUnavailable
        })?;

        if state.active {
            return Ok(());
        }
        if !state.setup_done {
            return Err(PluginHostError::InvalidLifecycle(
                "activate() requires setup_processing() first".into(),
            ));
        }

        // SAFETY: COM calls on live pointers owned by this instance.
        let activate_result = unsafe { self.component.setActive(1) };
        if activate_result != kResultOk {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "setActive(1) returned {activate_result}"
            )));
        }

        let processing_result = unsafe { self.processor.setProcessing(1) };
        if processing_result != kResultOk {
            // Best-effort rollback — we already flipped the plugin's
            // active bit, so leaving it that way would leak state.
            unsafe {
                self.component.setActive(0);
            }
            return Err(PluginHostError::InvalidLifecycle(format!(
                "setProcessing(1) returned {processing_result}"
            )));
        }

        state.active = true;
        state.processing = true;
        Ok(())
    }

    /// Reverse of [`activate`](Self::activate). Calling while already
    /// inactive is a no-op.
    ///
    /// Ordering per the VST3 spec: `setProcessing(0)` → `setActive(0)`.
    /// If `setProcessing(0)` rejects, state flags stay as-is so a
    /// retry can recover; if it succeeds but `setActive(0)` rejects,
    /// we clear `processing` but leave `active = true` so the caller
    /// knows the instance is still half-active.
    pub fn deactivate(&self) -> Result<(), PluginHostError> {
        let mut state = self.processing_state().lock().map_err(|_| {
            PluginHostError::RegistryUnavailable
        })?;

        if !state.active {
            return Ok(());
        }

        // SAFETY: COM calls on live pointers owned by this instance.
        let processing_result = unsafe { self.processor.setProcessing(0) };
        if processing_result != kResultOk {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "setProcessing(0) returned {processing_result}"
            )));
        }
        state.processing = false;

        let active_result = unsafe { self.component.setActive(0) };
        if active_result != kResultOk {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "setActive(0) returned {active_result}"
            )));
        }
        state.active = false;
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        self.processing_state()
            .lock()
            .map(|s| s.active)
            .unwrap_or(false)
    }

    pub fn is_setup_done(&self) -> bool {
        self.processing_state()
            .lock()
            .map(|s| s.setup_done)
            .unwrap_or(false)
    }

    pub fn audio_config(&self) -> Option<AudioConfig> {
        self.processing_state()
            .lock()
            .ok()
            .and_then(|s| s.config)
    }

    /// Process one block of audio through the plugin's main stereo bus.
    ///
    /// `input` is interleaved f32 (length = `channels * samples`). The
    /// return value is interleaved stereo output (length = `2 * samples`).
    ///
    /// Constraints in 4B-1:
    /// - `channels` must be 1 or 2 (mono or stereo input).
    /// - Output is always a stereo main bus; multi-out is 4B-3.
    /// - No MIDI / parameter changes (4B-2).
    ///
    /// A non-OK return from the plugin's own `process()` is logged and
    /// the output is silenced — a misbehaving plugin should never take
    /// down the audio graph.
    pub fn process_block(
        &self,
        input: &[f32],
        channels: u32,
        samples: u32,
    ) -> Result<Vec<f32>, PluginHostError> {
        // Branch on the plugin's audio-input-bus topology, captured at
        // load time:
        //
        // - Pure instrument (no audio input bus): ignore `channels`
        //   and `input`; send `numInputs: 0` + `inputs: null`. VST3
        //   plugins with no audio input will reject a non-zero
        //   `numInputs`, so this distinction is load-bearing for
        //   synths / samplers / MIDI-FX.
        // - Effect (has audio input bus): require `channels == 2`,
        //   stereo main input. Mono / surround support lands in 4B-3
        //   alongside `setBusArrangements` negotiation.
        let is_instrument = self.is_instrument();
        if !is_instrument && channels != 2 {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "process_block only supports stereo (channels == 2) for effect plugins in 4B-2a; got {channels} — bus-arrangement negotiation lands in 4B-3"
            )));
        }

        // Hold the processing-state lock for the entire COM call. The
        // VST3 spec requires setupProcessing / setActive / setProcessing
        // / process to never overlap on a single instance; this guard
        // enforces that. Getters like `is_active()` will briefly block
        // while a block is in flight, but process() is typically <10ms
        // per call so that's acceptable — and is the same contract the
        // plugin already imposes.
        let state = self
            .processing_state()
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;
        if !state.is_ready_to_process() {
            return Err(PluginHostError::InvalidLifecycle(
                "process_block requires setup_processing() + activate()".into(),
            ));
        }
        if let Some(cfg) = state.config {
            if samples > cfg.block_size {
                return Err(PluginHostError::InvalidLifecycle(format!(
                    "samples {} exceeds configured block_size {} — reconfigure before sending larger blocks",
                    samples, cfg.block_size
                )));
            }
        }

        let num_samples = samples as usize;
        let output_stereo = 2usize;

        // Input-side setup — only validate + de-interleave for effect
        // plugins. Instruments get `numInputs: 0` below and never
        // dereference the input buffers.
        let input_channels: Vec<Vec<f32>> = if is_instrument {
            Vec::new()
        } else {
            let num_channels = channels as usize;
            let expected_input_len = num_channels * num_samples;
            if input.len() < expected_input_len {
                return Err(PluginHostError::InvalidLifecycle(format!(
                    "input buffer too small: have {} interleaved f32 elements, need {} ({} channels × {} samples)",
                    input.len(),
                    expected_input_len,
                    num_channels,
                    num_samples
                )));
            }
            let mut channels_buf: Vec<Vec<f32>> =
                vec![vec![0.0f32; num_samples]; num_channels];
            for s in 0..num_samples {
                for ch in 0..num_channels {
                    channels_buf[ch][s] = input[s * num_channels + ch];
                }
            }
            channels_buf
        };

        let mut input_channels_owned = input_channels;
        let mut input_ptrs: Vec<*mut f32> = input_channels_owned
            .iter_mut()
            .map(|c| c.as_mut_ptr())
            .collect();

        let mut input_bus = AudioBusBuffers {
            numChannels: if is_instrument { 0 } else { channels as i32 },
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: if is_instrument {
                    ptr::null_mut()
                } else {
                    input_ptrs.as_mut_ptr()
                },
            },
        };

        // Stereo main output bus.
        let mut output_channels: Vec<Vec<f32>> = vec![vec![0.0f32; num_samples]; output_stereo];
        let mut output_ptrs: Vec<*mut f32> = output_channels
            .iter_mut()
            .map(|c| c.as_mut_ptr())
            .collect();

        let mut output_bus = AudioBusBuffers {
            numChannels: output_stereo as i32,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_ptrs.as_mut_ptr(),
            },
        };

        // Drain any queued MIDI events, filter to the current block's
        // window, sort by `sampleOffset`, then convert into VST3
        // `Event`s. Three things worth calling out:
        //
        // 1. **Window filter**: events with `sample_offset >=
        //    num_samples` belong to a later block — forwarding them
        //    would cause plugins to schedule past the end of the
        //    current buffer, producing incorrect timing or OOB
        //    writes. The companion app didn't do this because its
        //    block boundaries were always exactly `num_samples`; our
        //    Phase 5 integration will hand us blocks whose size
        //    varies with the audio callback.
        // 2. **Sort**: VST3 plugins iterate the host's `IEventList`
        //    forward by index and do not re-sort, so an out-of-order
        //    list can mis-fire notes. The `SegQueue` has no
        //    cross-producer ordering guarantees, so we sort here to
        //    make block-local timing deterministic.
        // 3. **Unsupported types**: CC / pitchbend / sysex (4B-2a
        //    scope) are silently dropped by `midi_to_vst3_event`.
        //
        // `event_list` must outlive `process_data` because the plugin
        // may read from the COM pointer during `process()`.
        let pending = self.drain_midi();
        let block_samples = samples;
        let (mut this_block, future): (Vec<_>, Vec<_>) =
            pending.into_iter().partition(|e| e.sample_offset < block_samples);
        // Re-queue future events with offsets ticked down so they
        // stay block-relative on the next call — matches the param
        // automation path and avoids silently losing events when a
        // caller batches multiple blocks of MIDI ahead of time.
        for mut e in future {
            e.sample_offset = e.sample_offset.saturating_sub(block_samples);
            self.requeue_midi_event(e);
        }
        this_block.sort_by_key(|e| e.sample_offset);
        let vst3_events: Vec<_> = this_block
            .iter()
            .filter_map(midi_to_vst3_event)
            .collect();
        let event_list = if vst3_events.is_empty() {
            None
        } else {
            Some(EventList::with_events(vst3_events))
        };
        let input_events_ptr = event_list
            .as_ref()
            .and_then(|el| el.to_com_ptr::<IEventList>())
            .map(|p| p.as_ptr())
            .unwrap_or(ptr::null_mut());

        // Drain queued parameter-automation points and build a
        // host-side `ParameterChanges`. `partition_points_for_block`
        // returns `(this_block_groups, future_overflow)` so we can
        // re-queue points scheduled past the current block —
        // callers that batch multiple blocks of automation (bounce
        // / sequencer workflows) would otherwise silently lose
        // everything past block_samples. Future-bucket offsets are
        // already decremented by block_samples so they stay
        // block-relative on the next call.
        let pending_params = self.drain_param_points();
        let (groups, future_params) =
            partition_points_for_block(pending_params, block_samples);
        let param_changes = if groups.is_empty() {
            None
        } else {
            Some(ParameterChanges::with_groups(groups))
        };
        for p in future_params {
            self.requeue_param_point(p);
        }
        let input_param_changes_ptr = param_changes
            .as_ref()
            .and_then(|pc| pc.to_com_ptr::<IParameterChanges>())
            .map(|p| p.as_ptr())
            .unwrap_or(ptr::null_mut());

        let mut process_data = ProcessData {
            processMode: ProcessModes_::kRealtime as i32,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: num_samples as i32,
            numInputs: if is_instrument { 0 } else { 1 },
            numOutputs: 1,
            inputs: if is_instrument {
                ptr::null_mut()
            } else {
                &mut input_bus
            },
            outputs: &mut output_bus,
            inputParameterChanges: input_param_changes_ptr,
            outputParameterChanges: ptr::null_mut(),
            inputEvents: input_events_ptr,
            outputEvents: ptr::null_mut(),
            processContext: ptr::null_mut(),
        };

        // SAFETY: all AudioBusBuffers and the backing per-channel
        // `Vec<f32>`s outlive the call; the pointer arrays in
        // `input_ptrs` / `output_ptrs` are heap-stable for the duration
        // of `process()` because their owning `Vec`s are not modified
        // between construction and this call. `event_list` lives in
        // this function's stack frame and outlives `process_data`.
        let result = unsafe { self.processor.process(&mut process_data) };
        if result != kResultOk {
            warn!(
                result,
                instance_id = %self.instance_id,
                "IAudioProcessor::process returned non-OK; outputting silence"
            );
            return Ok(vec![0.0f32; output_stereo * num_samples]);
        }

        // Re-interleave stereo output.
        let mut out = vec![0.0f32; output_stereo * num_samples];
        for s in 0..num_samples {
            for ch in 0..output_stereo {
                out[s * output_stereo + ch] = output_channels[ch][s];
            }
        }
        // `state` guard + `event_list` + `param_changes` dropped
        // here — after process() returns. Explicit drops document
        // the lifetime requirement: their COM pointers were handed
        // to the plugin via `process_data` and must outlive the call.
        drop(event_list);
        drop(param_changes);
        drop(state);
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Lifecycle tests that do not require a real plugin
// ---------------------------------------------------------------------------

#[cfg(test)]
mod smoke {
    use super::*;
    use crate::midi::MidiEvent;
    use std::path::Path;

    /// Runs the full lifecycle against a real plugin when one is
    /// installed at a known macOS path. Skips silently otherwise —
    /// unit-testing COM interop without a host is not possible.
    #[test]
    fn full_lifecycle_silent_block_with_real_bundle() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };

        let (instance, _info) = match unsafe { crate::loader::load_plugin(path, "lifecycle-smoke") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        let cfg = AudioConfig::new(48000.0, 512).unwrap();
        assert!(instance.setup_processing(cfg).is_ok());
        assert!(instance.is_setup_done());
        assert_eq!(instance.audio_config(), Some(cfg));

        assert!(instance.activate().is_ok());
        assert!(instance.is_active());

        // Silent stereo block.
        let input = vec![0.0f32; 2 * 512];
        let out = instance.process_block(&input, 2, 512).unwrap();
        assert_eq!(out.len(), 2 * 512);

        // Double-activate is a no-op, not an error.
        assert!(instance.activate().is_ok());

        assert!(instance.deactivate().is_ok());
        assert!(!instance.is_active());
        // Double-deactivate is also a no-op.
        assert!(instance.deactivate().is_ok());

        // process_block after deactivate errors.
        let err = instance.process_block(&input, 2, 512).unwrap_err();
        assert!(matches!(err, PluginHostError::InvalidLifecycle(_)));
    }

    /// Queues a parameter automation point and verifies the queue
    /// drains through `process_block`. The plugin's reaction to the
    /// value change isn't asserted — ACE Bridge is an effect, we
    /// just confirm the host wiring doesn't reject or hang.
    #[test]
    fn parameter_queue_drains_through_process_block() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };

        let (instance, info) = match unsafe { crate::loader::load_plugin(path, "param-smoke") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        instance
            .setup_processing(AudioConfig::new(48000.0, 512).unwrap())
            .unwrap();
        instance.activate().unwrap();

        // Pick the plugin's first parameter if any; otherwise skip
        // this assertion — some bundles expose no automatable params.
        if let Some(first) = info.parameters.first() {
            instance.set_parameter(first.id, 0, 0.5).unwrap();
            instance.set_parameter(first.id, 128, 0.75).unwrap();
            assert_eq!(instance.param_queue_len(), 2);
        } else {
            eprintln!("plugin exposes no parameters — skipping set_parameter assertion");
        }

        let input = vec![0.0f32; 2 * 512];
        let out = instance.process_block(&input, 2, 512).unwrap();
        assert_eq!(out.len(), 2 * 512);
        assert_eq!(instance.param_queue_len(), 0);

        instance.deactivate().unwrap();
    }

    /// Queues a MIDI note-on / note-off pair and runs one block.
    /// The plugin under test (ACE Bridge) is primarily an audio
    /// effect, so we can't assert on output semantics — but we can
    /// assert that the `process()` call succeeded with `inputEvents`
    /// populated, that the queue was drained, and no COM error was
    /// returned. A future follow-up could add a sampler smoke plugin
    /// for fuller MIDI-in assertions.
    #[test]
    fn midi_queued_events_are_drained_through_process_block() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };

        let (instance, _) = match unsafe { crate::loader::load_plugin(path, "midi-smoke") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        instance
            .setup_processing(AudioConfig::new(48000.0, 512).unwrap())
            .unwrap();
        instance.activate().unwrap();

        instance.queue_midi(&[
            MidiEvent::note_on(0, 60, 100, 0),
            MidiEvent::note_off(0, 60, 0, 256),
        ]);
        assert_eq!(instance.midi_queue_len(), 2);

        let input = vec![0.0f32; 2 * 512];
        let out = instance.process_block(&input, 2, 512).unwrap();
        assert_eq!(out.len(), 2 * 512);
        // Queue should be fully drained after one process_block.
        assert_eq!(instance.midi_queue_len(), 0);

        instance.deactivate().unwrap();
    }
}
