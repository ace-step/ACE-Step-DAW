//! Instance registry. Owns every live `Vst3PluginInstance` and hands
//! out serialisable `InstanceInfo` snapshots to the caller. Thread-
//! safe via an internal `Mutex`; users clone `Arc<PluginHost>` to share
//! it between the Tauri command thread and (eventually) the audio
//! thread.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use tracing::{info, warn};
use uuid::Uuid;

use crate::error::PluginHostError;
use crate::host_impl::{HostParamChange, ParamChangeCollector};
use crate::loader::{load_plugin, Vst3PluginInstance};
use crate::types::InstanceInfo;

/// Process-wide plugin instance registry. One live `PluginHost` is
/// created at app startup; all plugin lifecycles flow through it.
pub struct PluginHost {
    inner: Mutex<Inner>,
    collector: ParamChangeCollector,
}

struct Inner {
    /// Instance ID → live COM handles. Dropping removes the entry
    /// and unloads the dylib.
    instances: HashMap<String, InstanceRecord>,
}

struct InstanceRecord {
    _instance: Vst3PluginInstance,
    info: InstanceInfo,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                instances: HashMap::new(),
            }),
            collector: ParamChangeCollector::new(),
        }
    }

    /// Shared collector that every new instance's `AceComponentHandler`
    /// writes into. Exposed so the Tauri layer can drain it on a
    /// timer and emit events to the UI.
    pub fn param_change_collector(&self) -> ParamChangeCollector {
        self.collector.clone()
    }

    /// Load a `.vst3` bundle and register the resulting instance.
    /// Returns the serialisable snapshot for the frontend.
    ///
    /// # Safety
    /// Loads native code via [`load_plugin`]. Only call with trusted
    /// bundle paths (scanner output or user selection).
    pub unsafe fn instantiate(
        &self,
        bundle_path: &Path,
    ) -> Result<InstanceInfo, PluginHostError> {
        let instance_id = Uuid::new_v4().to_string();
        let (instance, info) = load_plugin(bundle_path, &instance_id)?;

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;

        info!(instance_id = %info.instance_id, "plugin instantiated");
        inner.instances.insert(
            instance_id.clone(),
            InstanceRecord {
                _instance: instance,
                info: info.clone(),
            },
        );

        Ok(info)
    }

    /// Drop a live instance. Releasing the only reference to its
    /// `Vst3PluginInstance` unloads the dylib. Unknown instance IDs
    /// produce an error so callers notice stale handles.
    pub fn release(&self, instance_id: &str) -> Result<(), PluginHostError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;

        if inner.instances.remove(instance_id).is_some() {
            info!(%instance_id, "plugin released");
            Ok(())
        } else {
            warn!(%instance_id, "release called with unknown instance_id");
            Err(PluginHostError::UnknownInstance(instance_id.to_string()))
        }
    }

    /// Snapshot of every live instance's metadata. Ordering is
    /// unspecified (it's a `HashMap`) — callers that need a stable
    /// order must sort client-side.
    pub fn list(&self) -> Result<Vec<InstanceInfo>, PluginHostError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;
        Ok(inner.instances.values().map(|r| r.info.clone()).collect())
    }

    /// Drain the shared parameter-change queue. Intended for a polled
    /// event loop on the Tauri side.
    pub fn take_pending_param_changes(&self) -> Vec<HostParamChange> {
        self.collector.drain()
    }
}

impl Default for PluginHost {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_is_empty_on_fresh_host() {
        let host = PluginHost::new();
        assert!(host.list().unwrap().is_empty());
    }

    #[test]
    fn release_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host.release("ghost-instance").unwrap_err();
        match err {
            PluginHostError::UnknownInstance(id) => assert_eq!(id, "ghost-instance"),
            other => panic!("expected UnknownInstance, got {other:?}"),
        }
    }

    #[test]
    fn param_change_collector_is_shared_and_drainable() {
        let host = PluginHost::new();
        let collector = host.param_change_collector();
        collector.push(HostParamChange {
            instance_id: "x".into(),
            param_id: 1,
            value: 0.25,
        });

        let drained = host.take_pending_param_changes();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].param_id, 1);
        assert!(host.take_pending_param_changes().is_empty());
    }
}
