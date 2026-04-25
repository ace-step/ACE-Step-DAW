//! Engine configuration types shared between Rust and TypeScript.
//!
//! These are pure data — no audio hardware touched, so they are safe to
//! unit-test in a headless CI environment.

use serde::{Deserialize, Serialize};

/// Supported output sample rates. CPAL devices may advertise other rates,
/// but we constrain the UI to these until we have per-device negotiation.
pub const VALID_SAMPLE_RATES: &[u32] = &[44100, 48000, 96000];

/// Supported audio buffer sizes (frames per callback). Smaller = lower
/// latency but higher CPU / dropout risk. 128 @ 48kHz ≈ 2.67ms round trip.
pub const VALID_BUFFER_SIZES: &[u32] = &[32, 64, 128, 256, 512, 1024];

/// Reason an engine configuration was rejected. Reported as a string to
/// the frontend so users see something more specific than "invalid".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase", tag = "kind", content = "message")]
pub enum ConfigError {
    #[error("sample rate {0} Hz is not supported (allowed: {VALID_SAMPLE_RATES:?})")]
    InvalidSampleRate(u32),
    #[error("buffer size {0} frames is not supported (allowed: {VALID_BUFFER_SIZES:?})")]
    InvalidBufferSize(u32),
}

/// Requested engine configuration when starting the audio stream.
///
/// `device_name` is optional; `None` means "system default output".
/// The engine may fall back to a different config if CPAL rejects the
/// exact request — callers should inspect [`EngineStatus::active_config`]
/// after [`crate::engine::Engine::start`] returns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfig {
    pub sample_rate: u32,
    pub buffer_size: u32,
    pub device_name: Option<String>,
}

impl EngineConfig {
    /// Check that numeric fields are in the supported set. This runs before
    /// any CPAL calls so the caller gets a fast failure on obviously bad
    /// input, with a precise reason.
    pub fn validate(&self) -> Result<(), ConfigError> {
        if !VALID_SAMPLE_RATES.contains(&self.sample_rate) {
            return Err(ConfigError::InvalidSampleRate(self.sample_rate));
        }
        if !VALID_BUFFER_SIZES.contains(&self.buffer_size) {
            return Err(ConfigError::InvalidBufferSize(self.buffer_size));
        }
        Ok(())
    }

    pub fn default_48k() -> Self {
        Self {
            sample_rate: 48_000,
            buffer_size: 256,
            device_name: None,
        }
    }
}

/// Metadata about a discovered audio device, safe to serialize to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub max_channels: u16,
    /// All discrete sample rates the device advertises.
    pub supported_sample_rates: Vec<u32>,
    /// Min/max buffer size the device supports, in frames, if known.
    pub buffer_size_range: Option<(u32, u32)>,
}

/// Runtime state of the engine as seen by the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum EngineStatus {
    Stopped,
    Running {
        active_config: EngineConfig,
        device_name: String,
        channels: u16,
    },
}

impl EngineStatus {
    pub fn is_running(&self) -> bool {
        matches!(self, EngineStatus::Running { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_supported_sample_rates() {
        for &rate in VALID_SAMPLE_RATES {
            let cfg = EngineConfig {
                sample_rate: rate,
                buffer_size: 256,
                device_name: None,
            };
            assert!(cfg.validate().is_ok(), "rate {rate} should be valid");
        }
    }

    #[test]
    fn validate_rejects_unsupported_sample_rate() {
        let cfg = EngineConfig {
            sample_rate: 22_050,
            buffer_size: 256,
            device_name: None,
        };
        assert_eq!(
            cfg.validate(),
            Err(ConfigError::InvalidSampleRate(22_050))
        );
    }

    #[test]
    fn validate_accepts_all_supported_buffer_sizes() {
        for &size in VALID_BUFFER_SIZES {
            let cfg = EngineConfig {
                sample_rate: 48_000,
                buffer_size: size,
                device_name: None,
            };
            assert!(cfg.validate().is_ok(), "buffer {size} should be valid");
        }
    }

    #[test]
    fn validate_rejects_unsupported_buffer_size() {
        let cfg = EngineConfig {
            sample_rate: 48_000,
            buffer_size: 333,
            device_name: None,
        };
        assert_eq!(cfg.validate(), Err(ConfigError::InvalidBufferSize(333)));
    }

    #[test]
    fn validate_reports_sample_rate_before_buffer_size() {
        // Both invalid — caller should see the first error, not a compound.
        let cfg = EngineConfig {
            sample_rate: 12_345,
            buffer_size: 777,
            device_name: None,
        };
        assert_eq!(cfg.validate(), Err(ConfigError::InvalidSampleRate(12_345)));
    }

    #[test]
    fn default_48k_is_valid() {
        assert!(EngineConfig::default_48k().validate().is_ok());
    }

    #[test]
    fn engine_status_running_reports_running() {
        let s = EngineStatus::Running {
            active_config: EngineConfig::default_48k(),
            device_name: "Test".into(),
            channels: 2,
        };
        assert!(s.is_running());
    }

    #[test]
    fn engine_status_stopped_reports_not_running() {
        assert!(!EngineStatus::Stopped.is_running());
    }

    #[test]
    fn engine_config_round_trips_through_serde() {
        let cfg = EngineConfig {
            sample_rate: 96_000,
            buffer_size: 64,
            device_name: Some("Focusrite Scarlett 2i2".into()),
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: EngineConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
        // camelCase field name on the wire
        assert!(json.contains("\"sampleRate\":96000"));
        assert!(json.contains("\"bufferSize\":64"));
        assert!(json.contains("\"deviceName\":\"Focusrite Scarlett 2i2\""));
    }

    #[test]
    fn audio_device_info_round_trips_through_serde() {
        let info = AudioDeviceInfo {
            name: "Built-in Output".into(),
            is_default: true,
            max_channels: 2,
            supported_sample_rates: vec![44_100, 48_000, 96_000],
            buffer_size_range: Some((64, 4096)),
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: AudioDeviceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(info, back);
    }
}
