//! Placeholder for preset management.
//!
//! Will eventually handle loading/saving VST3 plugin presets and factory
//! preset enumeration via the VST3 SDK.

use tracing::info;

/// Placeholder preset manager.
pub struct PresetManager;

impl PresetManager {
    pub fn new() -> Self {
        info!("PresetManager initialized (stub)");
        Self
    }
}
