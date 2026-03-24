//! Stub plugin host that manages plugin instance lifecycles.
//!
//! This module will eventually bridge to the C++ VST3 SDK. For now it returns
//! fake metadata and tracks active instance IDs.

use std::collections::HashMap;
use std::sync::Mutex;

use tracing::{info, warn};

use crate::error::{CompanionError, Result};
use crate::protocol::{ParamInfo, PresetInfo};

/// Metadata returned when a plugin is instantiated.
#[derive(Debug, Clone)]
pub struct InstanceInfo {
    pub instance_id: String,
    pub plugin_uid: String,
    pub parameters: Vec<ParamInfo>,
    pub latency_samples: u32,
    pub tail_samples: u32,
    pub presets: Vec<PresetInfo>,
}

/// Stub plugin host that tracks active instances in memory.
pub struct PluginHost {
    instances: Mutex<HashMap<String, InstanceInfo>>,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
        }
    }

    /// Instantiate a plugin. Returns stub metadata.
    ///
    /// In the real implementation this will load the VST3 binary and initialize
    /// the plugin component.
    pub fn instantiate(&self, plugin_uid: &str, instance_id: &str) -> Result<InstanceInfo> {
        let mut guard = self.instances.lock().unwrap();

        if guard.contains_key(instance_id) {
            return Err(CompanionError::Plugin(format!(
                "Instance '{instance_id}' already exists"
            )));
        }

        let info = InstanceInfo {
            instance_id: instance_id.to_string(),
            plugin_uid: plugin_uid.to_string(),
            parameters: vec![
                ParamInfo {
                    id: 0,
                    name: "Volume".into(),
                    default_value: 0.8,
                    min_value: 0.0,
                    max_value: 1.0,
                    unit: "dB".into(),
                },
                ParamInfo {
                    id: 1,
                    name: "Pan".into(),
                    default_value: 0.5,
                    min_value: 0.0,
                    max_value: 1.0,
                    unit: "".into(),
                },
            ],
            latency_samples: 0,
            tail_samples: 0,
            presets: vec![PresetInfo {
                id: 0,
                name: "Default".into(),
            }],
        };

        info!(
            instance_id,
            plugin_uid, "Instantiated stub plugin instance"
        );
        guard.insert(instance_id.to_string(), info.clone());
        Ok(info)
    }

    /// Destroy a plugin instance, freeing its resources.
    pub fn destroy(&self, instance_id: &str) -> Result<()> {
        let mut guard = self.instances.lock().unwrap();
        if guard.remove(instance_id).is_some() {
            info!(instance_id, "Destroyed plugin instance");
            Ok(())
        } else {
            warn!(instance_id, "Attempted to destroy unknown instance");
            Err(CompanionError::Plugin(format!(
                "Instance '{instance_id}' not found"
            )))
        }
    }

    /// Check whether an instance exists.
    pub fn has_instance(&self, instance_id: &str) -> bool {
        self.instances.lock().unwrap().contains_key(instance_id)
    }

    /// Return the number of active instances.
    pub fn instance_count(&self) -> usize {
        self.instances.lock().unwrap().len()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instantiate_and_destroy() {
        let host = PluginHost::new();
        assert_eq!(host.instance_count(), 0);

        let info = host.instantiate("uid-1", "inst-1").unwrap();
        assert_eq!(info.instance_id, "inst-1");
        assert_eq!(info.plugin_uid, "uid-1");
        assert!(!info.parameters.is_empty());
        assert_eq!(host.instance_count(), 1);
        assert!(host.has_instance("inst-1"));

        host.destroy("inst-1").unwrap();
        assert_eq!(host.instance_count(), 0);
        assert!(!host.has_instance("inst-1"));
    }

    #[test]
    fn test_duplicate_instance_id_errors() {
        let host = PluginHost::new();
        host.instantiate("uid-1", "inst-1").unwrap();
        let result = host.instantiate("uid-2", "inst-1");
        assert!(result.is_err());
    }

    #[test]
    fn test_destroy_unknown_instance_errors() {
        let host = PluginHost::new();
        let result = host.destroy("nonexistent");
        assert!(result.is_err());
    }
}
