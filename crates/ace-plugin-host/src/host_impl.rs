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

/// Implements `IComponentHandler`. VST3 plugins call into this when
/// the user turns a knob on the plugin's own GUI — the edit shows up
/// here and we funnel it into the shared collector.
pub struct AceComponentHandler {
    instance_id: String,
    collector: Arc<SegQueue<HostParamChange>>,
    /// Local queue used when no collector is wired up (helpful in
    /// tests — lets us assert on changes without instantiating a
    /// `ParamChangeCollector`).
    pub changes: SegQueue<HostParamChange>,
}

impl AceComponentHandler {
    /// Construct a handler whose edits are pushed only to its own
    /// local `changes` queue — used by tests.
    pub fn new() -> ComWrapper<Self> {
        ComWrapper::new(Self {
            instance_id: String::new(),
            collector: Arc::new(SegQueue::new()),
            changes: SegQueue::new(),
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
            changes: SegQueue::new(),
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

    unsafe fn restartComponent(&self, _flags: int32) -> tresult {
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
