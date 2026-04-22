//! Instance registry. Owns every live `Vst3PluginInstance` and hands
//! out serialisable `InstanceInfo` snapshots to the caller. Thread-
//! safe via an internal `Mutex`; users clone `Arc<PluginHost>` to share
//! it between the Tauri command thread and (eventually) the audio
//! thread.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use tracing::{info, warn};
use uuid::Uuid;

use crate::audio::AudioConfig;
use crate::error::PluginHostError;
use crate::host_impl::{
    ComponentRestartCollector, HostComponentRestart, HostParamChange, ParamChangeCollector,
};
use crate::loader::{load_plugin_with_collectors, Vst3PluginInstance};
use crate::midi::MidiEvent;
use crate::types::InstanceInfo;

/// Process-wide plugin instance registry. One live `PluginHost` is
/// created at app startup; all plugin lifecycles flow through it.
pub struct PluginHost {
    inner: Mutex<Inner>,
    collector: ParamChangeCollector,
    restart_collector: ComponentRestartCollector,
}

struct Inner {
    /// Instance ID → live COM handles. Dropping removes the entry
    /// and unloads the dylib.
    instances: HashMap<String, InstanceRecord>,
}

struct InstanceRecord {
    /// Wrapped in `Arc` so registry operations (lookup, list) can drop
    /// the registry lock before invoking long-running methods like
    /// `process_block` — otherwise a single plugin's process() call
    /// would block every other instance's lookups, and we'd serialise
    /// processing across all plugins on the audio thread.
    instance: Arc<Vst3PluginInstance>,
    info: InstanceInfo,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                instances: HashMap::new(),
            }),
            collector: ParamChangeCollector::new(),
            restart_collector: ComponentRestartCollector::new(),
        }
    }

    /// Shared collector that every new instance's `AceComponentHandler`
    /// writes into. Exposed so the Tauri layer can drain it on a
    /// timer and emit events to the UI.
    pub fn param_change_collector(&self) -> ParamChangeCollector {
        self.collector.clone()
    }

    /// Shared collector for `IComponentHandler::restartComponent`
    /// notifications — lets the Tauri layer react to plugin-side
    /// topology changes (latency, routing) by re-querying the
    /// instance and pushing a refresh to the UI.
    pub fn component_restart_collector(&self) -> ComponentRestartCollector {
        self.restart_collector.clone()
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
        let (instance, info) = load_plugin_with_collectors(
            bundle_path,
            &instance_id,
            Some(&self.collector),
            Some(&self.restart_collector),
        )?;

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;

        info!(instance_id = %info.instance_id, "plugin instantiated");
        inner.instances.insert(
            instance_id.clone(),
            InstanceRecord {
                instance: Arc::new(instance),
                info: info.clone(),
            },
        );

        Ok(info)
    }

    /// Look up a live instance by id, returning a cloned `Arc` so the
    /// caller can drop the registry lock before invoking methods on
    /// the instance. Returns `UnknownInstance` if not registered.
    fn lookup(&self, instance_id: &str) -> Result<Arc<Vst3PluginInstance>, PluginHostError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;
        inner
            .instances
            .get(instance_id)
            .map(|r| Arc::clone(&r.instance))
            .ok_or_else(|| PluginHostError::UnknownInstance(instance_id.to_string()))
    }

    /// Configure the plugin's audio pipeline. Must be called before
    /// [`activate_instance`](Self::activate_instance).
    pub fn configure_instance(
        &self,
        instance_id: &str,
        config: AudioConfig,
    ) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?.setup_processing(config)
    }

    /// Activate the plugin so it's ready to accept `process()` calls.
    pub fn activate_instance(&self, instance_id: &str) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?.activate()
    }

    /// Deactivate the plugin. Safe to call while already inactive.
    pub fn deactivate_instance(&self, instance_id: &str) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?.deactivate()
    }

    /// Run one block of audio through the instance. Returns the
    /// plugin's interleaved stereo output. The registry lock is
    /// released before the plugin's `process()` call, so concurrent
    /// processing on other instances is not blocked.
    pub fn process_instance_block(
        &self,
        instance_id: &str,
        input: &[f32],
        channels: u32,
        samples: u32,
    ) -> Result<Vec<f32>, PluginHostError> {
        self.lookup(instance_id)?
            .process_block(input, channels, samples)
    }

    /// Queue MIDI events for delivery on the instance's next
    /// `process_block` call. The queue is lock-free so multiple
    /// producers (sequencer thread, MIDI-learn handler, test) can
    /// push concurrently without blocking each other.
    pub fn queue_instance_midi(
        &self,
        instance_id: &str,
        events: &[MidiEvent],
    ) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?.queue_midi(events);
        Ok(())
    }

    /// Queue a parameter automation point for the instance. VST3
    /// values are always `[0.0, 1.0]` normalised — consult
    /// `ParamInfo` via `list`/`instance` metadata for the raw range.
    /// Thread-safe; same ordering contract as `queue_instance_midi`.
    pub fn set_instance_parameter(
        &self,
        instance_id: &str,
        param_id: u32,
        sample_offset: u32,
        value: f64,
    ) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?
            .set_parameter(param_id, sample_offset, value)
    }

    /// Serialise a plugin's state to an opaque byte blob suitable
    /// for persistence in a project file.
    pub fn save_instance_state(
        &self,
        instance_id: &str,
    ) -> Result<Vec<u8>, PluginHostError> {
        self.lookup(instance_id)?.save_state()
    }

    /// Restore a plugin's state from a blob previously returned by
    /// `save_instance_state`.
    pub fn load_instance_state(
        &self,
        instance_id: &str,
        blob: &[u8],
    ) -> Result<(), PluginHostError> {
        self.lookup(instance_id)?.load_state(blob)
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

    /// Drain queued restart notifications. Consumers inspect the
    /// flags and re-query affected instances — for `kLatencyChanged`,
    /// via `instance_latency`.
    pub fn take_pending_restart_notifications(&self) -> Vec<HostComponentRestart> {
        self.restart_collector.drain()
    }

    /// Current processing latency for an instance, re-queried live
    /// from the plugin. Use this after draining restart notifications
    /// to refresh the DAW's cached latency alignment.
    pub fn instance_latency(&self, instance_id: &str) -> Result<u32, PluginHostError> {
        Ok(self.lookup(instance_id)?.current_latency_samples())
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
    fn configure_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host
            .configure_instance("ghost", AudioConfig::default())
            .unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn activate_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host.activate_instance("ghost").unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn process_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host
            .process_instance_block("ghost", &[0.0; 1024], 2, 512)
            .unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn queue_midi_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host
            .queue_instance_midi("ghost", &[MidiEvent::note_on(0, 60, 100, 0)])
            .unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn set_parameter_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host
            .set_instance_parameter("ghost", 1, 0, 0.5)
            .unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn save_state_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host.save_instance_state("ghost").unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn load_state_unknown_instance_errors_out() {
        let host = PluginHost::new();
        let err = host.load_instance_state("ghost", &[]).unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn instance_latency_unknown_errors_out() {
        let host = PluginHost::new();
        let err = host.instance_latency("ghost").unwrap_err();
        assert!(matches!(err, PluginHostError::UnknownInstance(_)));
    }

    #[test]
    fn restart_collector_is_shared_and_drainable() {
        let host = PluginHost::new();
        let c = host.component_restart_collector();
        c.push(HostComponentRestart {
            instance_id: "i".into(),
            flags: crate::host_impl::RESTART_LATENCY_CHANGED,
        });
        let drained = host.take_pending_restart_notifications();
        assert_eq!(drained.len(), 1);
        assert!(host.take_pending_restart_notifications().is_empty());
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
