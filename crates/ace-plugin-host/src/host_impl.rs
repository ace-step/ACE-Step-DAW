//! VST3 host-side COM implementations. These classes are passed to
//! plugins during `IComponent::initialize` so the plugin can call back
//! into the host — identifying itself, reporting parameter edits, etc.
//!
//! Phase 4A-3 scope: only the pieces needed to *load* a plugin.
//! MemoryStream (preset persistence) and EventList / MIDI conversion
//! (audio-thread integration) land in later subphases.

use std::ptr;
use std::sync::Arc;

use crossbeam::queue::SegQueue;
use vst3::Steinberg::Vst::{
    IComponentHandler, IComponentHandlerTrait, IHostApplication, IHostApplicationTrait, ParamID,
    ParamValue, String128,
};
use vst3::Steinberg::{kInvalidArgument, kResultFalse, kResultOk, int32, tresult, TUID};
use vst3::{Class, ComWrapper};

// ---------------------------------------------------------------------------
// Parameter change notification
// ---------------------------------------------------------------------------

/// A parameter change reported by the plugin — typically triggered by
/// the plugin's own GUI. The host receives these asynchronously and
/// surfaces them to the frontend so UI controls stay in sync.
#[derive(Debug, Clone, PartialEq)]
pub struct HostParamChange {
    pub instance_id: String,
    pub param_id: u32,
    pub value: f64,
}

/// A restart notification from the plugin's `IComponentHandler::restartComponent`
/// call. The `flags` bitfield is Steinberg's `RestartFlags`; callers
/// inspect `kLatencyChanged` (`1 << 2`) to know when to re-query
/// `processor.getLatencySamples()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostComponentRestart {
    pub instance_id: String,
    pub flags: i32,
}

/// `RestartFlags::kLatencyChanged` per VST3 SDK
/// `pluginterfaces/vst/ivsteditcontroller.h`.
pub const RESTART_LATENCY_CHANGED: i32 = 1 << 2;

/// Shared lock-free queue that aggregates parameter changes from every
/// loaded plugin. Cloning is cheap (internal `Arc`). The Tauri layer
/// drains this queue periodically and forwards the changes as events.
#[derive(Clone, Default)]
pub struct ParamChangeCollector {
    queue: Arc<SegQueue<HostParamChange>>,
}

impl ParamChangeCollector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&self, change: HostParamChange) {
        self.queue.push(change);
    }

    /// Drain every pending change in FIFO order. Returns an empty vec
    /// when nothing is queued.
    pub fn drain(&self) -> Vec<HostParamChange> {
        let mut changes = Vec::new();
        while let Some(change) = self.queue.pop() {
            changes.push(change);
        }
        changes
    }

    pub(crate) fn queue_arc(&self) -> &Arc<SegQueue<HostParamChange>> {
        &self.queue
    }
}

/// Shared lock-free queue for `IComponentHandler::restartComponent`
/// notifications. Separate from the parameter-change collector
/// because the payloads and consumers are different — the Tauri
/// layer reacts to restart by re-querying latency and pushing a
/// fresh `InstanceInfo` to the UI.
#[derive(Clone, Default)]
pub struct ComponentRestartCollector {
    queue: Arc<SegQueue<HostComponentRestart>>,
}

impl ComponentRestartCollector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&self, notification: HostComponentRestart) {
        self.queue.push(notification);
    }

    pub fn drain(&self) -> Vec<HostComponentRestart> {
        let mut out = Vec::new();
        while let Some(n) = self.queue.pop() {
            out.push(n);
        }
        out
    }

    pub(crate) fn queue_arc(&self) -> &Arc<SegQueue<HostComponentRestart>> {
        &self.queue
    }
}

/// Implements `IComponentHandler`. VST3 plugins call into this when
/// the user turns a knob on the plugin's own GUI — the edit shows up
/// here and we funnel it into the shared collector. The plugin also
/// calls `restartComponent` when its internal topology changes
/// (latency, routing, parameter values); those go into the separate
/// restart collector.
pub struct AceComponentHandler {
    instance_id: String,
    collector: Arc<SegQueue<HostParamChange>>,
    restart_collector: Arc<SegQueue<HostComponentRestart>>,
    /// Local queue used when no collector is wired up (helpful in
    /// tests — lets us assert on changes without instantiating a
    /// `ParamChangeCollector`).
    pub changes: SegQueue<HostParamChange>,
    /// Local queue for restart notifications, same test convenience.
    pub restarts: SegQueue<HostComponentRestart>,
}

impl AceComponentHandler {
    /// Construct a handler whose edits are pushed only to its own
    /// local queues — used by tests.
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id: String::new(),
            collector: Arc::new(SegQueue::new()),
            restart_collector: Arc::new(SegQueue::new()),
            changes: SegQueue::new(),
            restarts: SegQueue::new(),
        })
    }

    /// Construct a handler that mirrors every edit into `collector`
    /// alongside the local queue.
    pub fn with_collector(
        instance_id: String,
        collector: &ParamChangeCollector,
    ) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id,
            collector: Arc::clone(collector.queue_arc()),
            restart_collector: Arc::new(SegQueue::new()),
            changes: SegQueue::new(),
            restarts: SegQueue::new(),
        })
    }

    /// Full-featured constructor wiring both the param-change and
    /// restart collectors. Used by the real host registry; tests
    /// stick with the simpler `new` / `with_collector` variants.
    pub fn with_collectors(
        instance_id: String,
        params: &ParamChangeCollector,
        restarts: &ComponentRestartCollector,
    ) -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id,
            collector: Arc::clone(params.queue_arc()),
            restart_collector: Arc::clone(restarts.queue_arc()),
            changes: SegQueue::new(),
            restarts: SegQueue::new(),
        })
    }
}

impl Class for AceComponentHandler {
    type Interfaces = (IComponentHandler,);
}

impl IComponentHandlerTrait for AceComponentHandler {
    unsafe fn beginEdit(&self, _id: ParamID) -> tresult {
        kResultOk
    }

    unsafe fn performEdit(&self, id: ParamID, value_normalized: ParamValue) -> tresult {
        let change = HostParamChange {
            instance_id: self.instance_id.clone(),
            param_id: id,
            value: value_normalized,
        };
        self.collector.push(change.clone());
        self.changes.push(change);
        kResultOk
    }

    unsafe fn endEdit(&self, _id: ParamID) -> tresult {
        kResultOk
    }

    unsafe fn restartComponent(&self, flags: int32) -> tresult {
        // Non-zero flags means "something topologically changed —
        // re-query me". We preserve the full bitfield rather than
        // peeling out individual flags here; the consumer (Tauri
        // layer in Phase 5) decides what to re-query based on which
        // bits are set. A zero `flags` is technically ambiguous per
        // spec — some plugins call this without flags as a generic
        // "poke me to refresh"; we pass it through so consumers can
        // treat it as a full refresh if they choose.
        let notification = HostComponentRestart {
            instance_id: self.instance_id.clone(),
            flags,
        };
        self.restart_collector.push(notification.clone());
        self.restarts.push(notification);
        kResultOk
    }
}

// ---------------------------------------------------------------------------
// Host application identity
// ---------------------------------------------------------------------------

/// Implements `IHostApplication` — the plugin asks for our name and
/// (sometimes) asks us to create sub-objects. We decline the latter
/// politely; the name identifies the host in the plugin's log output.
pub struct AceHostApplication;

impl AceHostApplication {
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self)
    }
}

impl Class for AceHostApplication {
    type Interfaces = (IHostApplication,);
}

impl IHostApplicationTrait for AceHostApplication {
    unsafe fn getName(&self, name: *mut String128) -> tresult {
        if name.is_null() {
            return kInvalidArgument;
        }
        let host_name = "ACE-Step DAW";
        let name_ref = &mut *name;
        for (i, ch) in host_name.encode_utf16().enumerate() {
            if i >= 127 {
                break;
            }
            name_ref[i] = ch;
        }
        let len = host_name.encode_utf16().count().min(127);
        name_ref[len] = 0;
        kResultOk
    }

    unsafe fn createInstance(
        &self,
        _cid: *mut TUID,
        _iid: *mut TUID,
        obj: *mut *mut std::ffi::c_void,
    ) -> tresult {
        if !obj.is_null() {
            *obj = ptr::null_mut();
        }
        kResultFalse
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_handler_captures_edits_in_order() {
        let handler = AceComponentHandler::new();
        unsafe {
            handler.performEdit(42, 0.75);
            handler.performEdit(7, 0.5);
        }
        let c1 = handler.changes.pop().unwrap();
        assert_eq!(c1.param_id, 42);
        assert!((c1.value - 0.75).abs() < f64::EPSILON);

        let c2 = handler.changes.pop().unwrap();
        assert_eq!(c2.param_id, 7);
        assert!((c2.value - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn restart_component_with_zero_flags_still_produces_notification() {
        // Some plugins call restartComponent() with flags=0 as a
        // generic "please refresh me" poke. Consumers can choose to
        // treat it as a full refresh; we shouldn't drop the signal.
        let handler = AceComponentHandler::new();
        unsafe {
            handler.restartComponent(0);
        }
        let n = handler.restarts.pop().unwrap();
        assert_eq!(n.flags, 0);
    }

    #[test]
    fn restart_component_preserves_flags_bitfield() {
        // Don't peel out individual flags — pass the raw bitfield
        // through so consumers can inspect whichever bits they care
        // about.
        let handler = AceComponentHandler::new();
        let combined = RESTART_LATENCY_CHANGED | (1 << 1) | (1 << 8);
        unsafe {
            handler.restartComponent(combined);
        }
        let n = handler.restarts.pop().unwrap();
        assert_eq!(n.flags, combined);
        assert!(n.flags & RESTART_LATENCY_CHANGED != 0);
    }

    #[test]
    fn restart_component_pushes_into_shared_collector() {
        let params = ParamChangeCollector::new();
        let restarts = ComponentRestartCollector::new();
        let h = AceComponentHandler::with_collectors(
            "inst-9".into(),
            &params,
            &restarts,
        );
        unsafe {
            h.restartComponent(RESTART_LATENCY_CHANGED);
        }
        let drained = restarts.drain();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].instance_id, "inst-9");
        assert_eq!(drained[0].flags, RESTART_LATENCY_CHANGED);
        assert!(restarts.drain().is_empty(), "drain is destructive");
    }

    #[test]
    fn collector_aggregates_changes_across_handlers_preserving_order() {
        let collector = ParamChangeCollector::new();
        let h1 = AceComponentHandler::with_collector("inst-1".into(), &collector);
        let h2 = AceComponentHandler::with_collector("inst-2".into(), &collector);

        unsafe {
            h1.performEdit(1, 0.5);
            h2.performEdit(2, 0.75);
            h1.performEdit(3, 1.0);
        }

        let changes = collector.drain();
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].instance_id, "inst-1");
        assert_eq!(changes[0].param_id, 1);
        assert_eq!(changes[1].instance_id, "inst-2");
        assert_eq!(changes[1].param_id, 2);
        assert_eq!(changes[2].instance_id, "inst-1");
        assert_eq!(changes[2].param_id, 3);

        assert!(collector.drain().is_empty(), "drain is destructive");
    }

    #[test]
    fn host_application_identifies_itself_as_ace_step_daw() {
        let host = AceHostApplication::new();
        let mut name: String128 = [0u16; 128];
        unsafe {
            let result = host.getName(&mut name);
            assert_eq!(result, kResultOk);
        }
        let s: String = name
            .iter()
            .take_while(|&&c| c != 0)
            .map(|&c| char::from(c as u8))
            .collect();
        assert_eq!(s, "ACE-Step DAW");
    }

    #[test]
    fn host_application_getname_rejects_null_pointer() {
        let host = AceHostApplication::new();
        unsafe {
            let result = host.getName(ptr::null_mut());
            assert_eq!(result, kInvalidArgument);
        }
    }

    #[test]
    fn host_application_createinstance_returns_false_and_nulls_out_obj() {
        let host = AceHostApplication::new();
        let mut out: *mut std::ffi::c_void = 0xDEADBEEF as *mut _;
        unsafe {
            let mut dummy_cid: TUID = [0i8; 16];
            let mut dummy_iid: TUID = [0i8; 16];
            let result = host.createInstance(&mut dummy_cid, &mut dummy_iid, &mut out);
            assert_eq!(result, kResultFalse);
            assert!(out.is_null(), "out pointer must be zeroed on decline");
        }
    }
}
