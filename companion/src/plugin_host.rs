//! Plugin host that manages VST3 plugin instance lifecycles.
//!
//! Uses `vst3_loader` to load real VST3 plugins from their bundle paths.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use tracing::{info, warn};

use crate::error::{CompanionError, Result};
use crate::protocol::{ParamInfo, PresetInfo};
use crate::vst3_loader::{self, Vst3PluginInstance};

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

/// Plugin host that loads and manages real VST3 plugin instances.
pub struct PluginHost {
    instances: Mutex<HashMap<String, InstanceInfo>>,
    live_instances: Mutex<HashMap<String, Vst3PluginInstance>>,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            live_instances: Mutex::new(HashMap::new()),
        }
    }

    /// Instantiate a VST3 plugin from its bundle path.
    ///
    /// `plugin_path` is the full path to the `.vst3` bundle.
    /// `plugin_uid` is stored as metadata for protocol responses.
    pub fn instantiate(
        &self,
        plugin_uid: &str,
        instance_id: &str,
        plugin_path: Option<&Path>,
    ) -> Result<InstanceInfo> {
        let mut guard = self.instances.lock().unwrap();

        if guard.contains_key(instance_id) {
            return Err(CompanionError::Plugin(format!(
                "Instance '{instance_id}' already exists"
            )));
        }

        let (info, live_instance) = if let Some(path) = plugin_path {
            // Real VST3 loading
            let (instance, metadata) = unsafe { vst3_loader::load_plugin(path, instance_id) }?;

            let info = InstanceInfo {
                instance_id: instance_id.to_string(),
                plugin_uid: instance.plugin_uid.clone(),
                parameters: metadata.parameters,
                latency_samples: metadata.latency_samples,
                tail_samples: metadata.tail_samples,
                presets: vec![PresetInfo { id: 0, name: "Default".into() }],
            };

            info!(
                instance_id,
                plugin_uid = %info.plugin_uid,
                params = info.parameters.len(),
                latency = info.latency_samples,
                "Instantiated real VST3 plugin"
            );

            (info, Some(instance))
        } else {
            // Fallback: stub instance (for testing or when path is unknown)
            let info = InstanceInfo {
                instance_id: instance_id.to_string(),
                plugin_uid: plugin_uid.to_string(),
                parameters: vec![],
                latency_samples: 0,
                tail_samples: 0,
                presets: vec![PresetInfo { id: 0, name: "Default".into() }],
            };

            warn!(instance_id, plugin_uid, "Instantiated stub (no plugin path)");
            (info, None)
        };

        guard.insert(instance_id.to_string(), info.clone());

        if let Some(live) = live_instance {
            self.live_instances.lock().unwrap().insert(instance_id.to_string(), live);
        }

        Ok(info)
    }

    /// Destroy a plugin instance, freeing its resources.
    pub fn destroy(&self, instance_id: &str) -> Result<()> {
        let mut guard = self.instances.lock().unwrap();
        let removed = guard.remove(instance_id).is_some();

        // Drop the live instance (triggers COM release)
        self.live_instances.lock().unwrap().remove(instance_id);

        if removed {
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
    fn test_instantiate_stub_and_destroy() {
        let host = PluginHost::new();
        assert_eq!(host.instance_count(), 0);

        let info = host.instantiate("uid-1", "inst-1", None).unwrap();
        assert_eq!(info.instance_id, "inst-1");
        assert_eq!(info.plugin_uid, "uid-1");
        assert_eq!(host.instance_count(), 1);
        assert!(host.has_instance("inst-1"));

        host.destroy("inst-1").unwrap();
        assert_eq!(host.instance_count(), 0);
    }

    #[test]
    fn test_duplicate_instance_id_errors() {
        let host = PluginHost::new();
        host.instantiate("uid-1", "inst-1", None).unwrap();
        let result = host.instantiate("uid-2", "inst-1", None);
        assert!(result.is_err());
    }

    #[test]
    fn test_destroy_unknown_instance_errors() {
        let host = PluginHost::new();
        let result = host.destroy("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_instantiate_real_plugin() {
        let path = Path::new("/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3");
        if !path.exists() {
            eprintln!("Skipping: ACE Bridge not installed");
            return;
        }

        let host = PluginHost::new();
        let info = host.instantiate("test-uid", "inst-real", Some(path)).unwrap();
        assert_eq!(info.instance_id, "inst-real");
        assert!(!info.plugin_uid.is_empty());
        println!("Real plugin UID: {}, params: {}", info.plugin_uid, info.parameters.len());

        host.destroy("inst-real").unwrap();
        assert_eq!(host.instance_count(), 0);
    }
}
