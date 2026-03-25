//! Plugin host that manages VST3 plugin instance lifecycles.
//!
//! Uses `vst3_loader` to load real VST3 plugins from their bundle paths.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use tracing::{info, warn};

use crate::error::{CompanionError, Result};
use crate::host_impl::MemoryStream;
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

    /// Run a closure on a live plugin instance, returning `stub_default` for
    /// stub instances (registered but no real VST3 loaded).
    ///
    /// Returns `Err` if the instance_id is completely unknown.
    fn with_live_instance<T, F>(&self, instance_id: &str, stub_default: T, f: F) -> Result<T>
    where
        F: FnOnce(&Vst3PluginInstance) -> T,
    {
        let guard = self.live_instances.lock().unwrap();
        if let Some(instance) = guard.get(instance_id) {
            Ok(f(instance))
        } else if self.instances.lock().unwrap().contains_key(instance_id) {
            Ok(stub_default)
        } else {
            Err(CompanionError::Plugin(format!(
                "Instance '{instance_id}' not found"
            )))
        }
    }

    /// Set a parameter value on a live plugin instance via IEditController.
    pub fn set_parameter(&self, instance_id: &str, param_id: u32, value: f64) -> Result<()> {
        self.with_live_instance(instance_id, (), |instance| {
            if let Some(ref controller) = instance.controller {
                unsafe {
                    use vst3::Steinberg::Vst::IEditControllerTrait;
                    controller.setParamNormalized(param_id, value);
                }
                info!(instance_id, param_id, value, "Set parameter via IEditController");
            } else {
                warn!(instance_id, param_id, "No IEditController — parameter set ignored");
            }
        })
    }

    /// Get the current state of a plugin instance via IComponent::getState().
    ///
    /// Returns the raw state bytes, or an empty vec for stub instances.
    pub fn get_state(&self, instance_id: &str) -> Result<Vec<u8>> {
        self.with_live_instance(instance_id, vec![], |instance| {
            let stream = MemoryStream::new();
            let stream_ptr = stream.to_com_ptr::<vst3::Steinberg::IBStream>();
            match stream_ptr {
                Some(ptr) => {
                    unsafe {
                        use vst3::Steinberg::Vst::IComponentTrait;
                        instance.component.getState(ptr.as_ptr());
                    }
                    let data = stream.into_data();
                    info!(instance_id, bytes = data.len(), "Got plugin state");
                    data
                }
                None => {
                    warn!(instance_id, "Failed to create IBStream for getState");
                    vec![]
                }
            }
        })
    }

    /// Set the state of a plugin instance via IComponent::setState().
    pub fn set_state(&self, instance_id: &str, data: &[u8]) -> Result<()> {
        self.with_live_instance(instance_id, (), |instance| {
            let stream = MemoryStream::from_data(data.to_vec());
            let stream_ptr = stream.to_com_ptr::<vst3::Steinberg::IBStream>();
            match stream_ptr {
                Some(ptr) => {
                    unsafe {
                        use vst3::Steinberg::Vst::IComponentTrait;
                        instance.component.setState(ptr.as_ptr());
                    }
                    info!(instance_id, bytes = data.len(), "Set plugin state");
                }
                None => {
                    warn!(instance_id, "Failed to create IBStream for setState");
                }
            }
        })
    }

    /// Set processing active/inactive via IAudioProcessor::setProcessing().
    pub fn set_processing(&self, instance_id: &str, active: bool) -> Result<()> {
        self.with_live_instance(instance_id, (), |instance| {
            unsafe {
                use vst3::Steinberg::Vst::{IAudioProcessorTrait, IComponentTrait};
                if active {
                    instance.component.setActive(1);
                    instance.processor.setProcessing(1);
                } else {
                    instance.processor.setProcessing(0);
                    instance.component.setActive(0);
                }
            }
            info!(instance_id, active, "Set processing state");
        })
    }

    /// Get latency from IAudioProcessor::getLatencySamples().
    pub fn get_latency(&self, instance_id: &str) -> Result<u32> {
        self.with_live_instance(instance_id, 0, |instance| {
            let samples = unsafe {
                use vst3::Steinberg::Vst::IAudioProcessorTrait;
                instance.processor.getLatencySamples() as u32
            };
            info!(instance_id, samples, "Got latency");
            samples
        })
    }

    /// Get the plugin UID for an instance.
    pub fn get_plugin_uid(&self, instance_id: &str) -> Result<String> {
        let guard = self.instances.lock().unwrap();
        guard
            .get(instance_id)
            .map(|info| info.plugin_uid.clone())
            .ok_or_else(|| {
                CompanionError::Plugin(format!("Instance '{instance_id}' not found"))
            })
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
