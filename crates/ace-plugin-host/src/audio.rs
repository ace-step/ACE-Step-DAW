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
//! - Empty `inputEvents` / `inputParameterChanges` (MIDI + automation
//!   land in 4B-2)
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
    AudioBusBuffers, AudioBusBuffers__type0, IAudioProcessorTrait, IComponentTrait, ProcessData,
    ProcessModes_, ProcessSetup, SymbolicSampleSizes_,
};
use vst3::Steinberg::kResultOk;

use crate::error::PluginHostError;
use crate::loader::Vst3PluginInstance;

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
    /// [`activate`](Self::activate). Re-calling resets `setup_done`
    /// and re-runs `IAudioProcessor::setupProcessing`, so changing
    /// sample rate or block size is supported — but only while the
    /// instance is *not* active (VST3 spec).
    pub fn setup_processing(&self, config: AudioConfig) -> Result<(), PluginHostError> {
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
        // The VST3 spec orders these as setActive(1) → setProcessing(1).
        unsafe {
            self.component.setActive(1);
            self.processor.setProcessing(1);
        }
        state.active = true;
        state.processing = true;
        Ok(())
    }

    /// Reverse of [`activate`](Self::activate). Calling while already
    /// inactive is a no-op.
    pub fn deactivate(&self) -> Result<(), PluginHostError> {
        let mut state = self.processing_state().lock().map_err(|_| {
            PluginHostError::RegistryUnavailable
        })?;

        if !state.active {
            return Ok(());
        }

        // SAFETY: COM calls on live pointers owned by this instance.
        // Reverse order: setProcessing(0) → setActive(0).
        unsafe {
            self.processor.setProcessing(0);
            self.component.setActive(0);
        }
        state.active = false;
        state.processing = false;
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
        if !(1..=2).contains(&channels) {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "process_block only supports 1 or 2 channels (got {channels})"
            )));
        }

        let state = self.processing_state().lock().map_err(|_| {
            PluginHostError::RegistryUnavailable
        })?;
        if !state.is_ready_to_process() {
            return Err(PluginHostError::InvalidLifecycle(
                "process_block requires setup_processing() + activate()".into(),
            ));
        }
        // Release the lock before entering the COM call — the plugin
        // must not re-enter us while processing, but a long-running
        // process() shouldn't hold up unrelated getters like is_active.
        drop(state);

        let num_channels = channels as usize;
        let num_samples = samples as usize;
        let output_stereo = 2usize;
        let expected_input_len = num_channels * num_samples;

        if input.len() < expected_input_len {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "input buffer too small: have {} samples, need {}",
                input.len(),
                expected_input_len
            )));
        }

        // De-interleave input into per-channel buffers.
        let mut input_channels: Vec<Vec<f32>> = vec![vec![0.0f32; num_samples]; num_channels];
        for s in 0..num_samples {
            for ch in 0..num_channels {
                input_channels[ch][s] = input[s * num_channels + ch];
            }
        }

        let mut input_ptrs: Vec<*mut f32> = input_channels
            .iter_mut()
            .map(|c| c.as_mut_ptr())
            .collect();

        let mut input_bus = AudioBusBuffers {
            numChannels: num_channels as i32,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: input_ptrs.as_mut_ptr(),
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

        let mut process_data = ProcessData {
            processMode: ProcessModes_::kRealtime as i32,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: num_samples as i32,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input_bus,
            outputs: &mut output_bus,
            inputParameterChanges: ptr::null_mut(),
            outputParameterChanges: ptr::null_mut(),
            inputEvents: ptr::null_mut(),
            outputEvents: ptr::null_mut(),
            processContext: ptr::null_mut(),
        };

        // SAFETY: all AudioBusBuffers and the backing per-channel
        // `Vec<f32>`s outlive the call; the pointer arrays in
        // `input_ptrs` / `output_ptrs` are heap-stable for the duration
        // of `process()` because their owning `Vec`s are not modified
        // between construction and this call.
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
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Lifecycle tests that do not require a real plugin
// ---------------------------------------------------------------------------

#[cfg(test)]
mod smoke {
    use super::*;
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
}
