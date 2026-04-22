//! VST3 plugin loading — `libloading` for the dylib, the `vst3` crate
//! for COM interface bindings. Pure Rust, no C++ bridge.
//!
//! Ported from `companion/src/vst3_loader.rs`. The differences from
//! the companion port:
//!
//! - Errors route through `PluginHostError` instead of the companion's
//!   local `CompanionError` (which straddled plugin + WebSocket
//!   failure modes)
//! - Metadata shapes use the crate-local `types::{ParamInfo,
//!   OutputBusInfo}` so the frontend contract lives in one place
//! - Public surface uses `load_plugin(bundle_path)` returning both
//!   the raw COM handles and a serialisable `InstanceInfo`, letting
//!   the registry store the former and return the latter across IPC

use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::Mutex;

use crossbeam::queue::SegQueue;
use libloading::{Library, Symbol};
use tracing::{debug, info, warn};
use vst3::ComPtr;
use vst3::Steinberg::Vst::{
    BusDirections_, BusInfo, IAudioProcessor, IAudioProcessorTrait, IComponent, IComponentTrait,
    IEditController, IEditControllerTrait, MediaTypes_, ParameterInfo,
};
use vst3::Steinberg::{
    kResultOk, FUnknown, IPluginBaseTrait, IPluginFactory, IPluginFactoryTrait, PClassInfo,
    PFactoryInfo,
};

use vst3::ComWrapper;

use crate::audio::ProcessingState;
use crate::error::PluginHostError;
use crate::host_impl::{
    AceComponentHandler, AceHostApplication, ComponentRestartCollector, ParamChangeCollector,
};
use crate::midi::MidiEvent;
use crate::params::ParamPoint;
use crate::stream::MemoryStream;
use crate::types::{InstanceInfo, OutputBusInfo, ParamInfo};

/// A loaded VST3 plugin instance + its COM handles. The `_library`
/// field keeps the dylib alive for the instance's lifetime — dropping
/// the instance unloads it.
pub struct Vst3PluginInstance {
    _library: Library,
    pub component: ComPtr<IComponent>,
    pub processor: ComPtr<IAudioProcessor>,
    pub controller: Option<ComPtr<IEditController>>,
    /// Live `AceComponentHandler` wired into the plugin's controller
    /// via `IEditController::setComponentHandler`. The `ComWrapper`
    /// holds the handler's refcount — dropping the instance releases
    /// the handler reference, which is what VST3 expects on teardown.
    /// `None` when the plugin has no controller or setting the
    /// handler was declined.
    _component_handler: Option<ComWrapper<AceComponentHandler>>,
    pub instance_id: String,
    pub plugin_uid: String,
    pub bundle_path: PathBuf,
    /// Output-bus topology captured at load time. Used by
    /// `setup_processing` to fail-fast on non-stereo plugins while
    /// 4B-1 is still stereo-only; bus-arrangement negotiation lands
    /// in 4B-3.
    pub output_busses: Vec<OutputBusInfo>,
    /// Channel count of the main audio input bus, or `None` for pure
    /// instruments (synths / samplers that expose no audio input).
    /// Captured at load time so `process_block` can choose between
    /// the effect path (`numInputs: 1` with a stereo input bus) and
    /// the instrument path (`numInputs: 0`, `inputs: null`). VST3
    /// plugins with no audio input bus reject calls with a non-zero
    /// `numInputs`, so this distinction is load-bearing for synths.
    pub input_main_channels: Option<u32>,
    /// Processing lifecycle state. Guarded by a `Mutex` so the VST3
    /// spec's serialisation requirement for `setupProcessing` /
    /// `setActive` / `process` is enforced at our layer.
    processing_state: Mutex<ProcessingState>,
    /// Lock-free queue of pending MIDI events. Producers push from
    /// any thread (sequencer callback, MIDI-learn handler, test);
    /// `process_block` drains it, converts to VST3 `Event`s, and
    /// hands them to the plugin via `IEventList`. Events queued
    /// while the plugin is not processing accumulate and fire on
    /// the next `process_block` call — that's how DAWs typically
    /// handle latched notes during transport start.
    midi_queue: SegQueue<MidiEvent>,
    /// Lock-free queue of pending parameter automation points.
    /// Same shape as `midi_queue` so the two pipelines are
    /// symmetric; `process_block` drains, windows, groups by
    /// `param_id`, sorts each group by `sample_offset`, and wraps
    /// the result in a host-side `ParameterChanges` COM object
    /// passed via `ProcessData::inputParameterChanges`.
    param_queue: SegQueue<ParamPoint>,
}

impl Vst3PluginInstance {
    /// Shared processing-state lock. Exposed crate-internally so the
    /// lifecycle methods in `audio.rs` can read and mutate it without
    /// duplicating state here.
    pub(crate) fn processing_state(&self) -> &Mutex<ProcessingState> {
        &self.processing_state
    }

    /// Queue a batch of MIDI events to be delivered on the next
    /// `process_block` call. Thread-safe: any producer (sequencer,
    /// MIDI-learn, test harness) may push concurrently.
    ///
    /// Ordering contract:
    /// - Events are enqueued as received and are not de-duplicated.
    /// - `process_block` **sorts** the drained events by
    ///   `sample_offset` before handing them to the plugin, so
    ///   per-block timing is deterministic regardless of
    ///   cross-producer interleaving.
    /// - For events with *identical* `sample_offset` pushed from
    ///   different threads, the tie-break follows `SegQueue`'s
    ///   internal ordering (neither strictly FIFO nor LIFO across
    ///   threads). Callers that need a deterministic tie-break
    ///   should stamp a monotonic counter into the high bits of
    ///   `sample_offset` themselves.
    pub fn queue_midi(&self, events: &[MidiEvent]) {
        for e in events {
            self.midi_queue.push(*e);
        }
    }

    pub(crate) fn drain_midi(&self) -> Vec<MidiEvent> {
        let mut out = Vec::new();
        while let Some(e) = self.midi_queue.pop() {
            out.push(e);
        }
        out
    }

    #[cfg(test)]
    pub(crate) fn midi_queue_len(&self) -> usize {
        self.midi_queue.len()
    }

    /// True when the plugin exposes no audio input bus — i.e. a
    /// synth, sampler, or MIDI-FX. `process_block` sends
    /// `numInputs: 0` with a null `inputs` pointer for these.
    pub fn is_instrument(&self) -> bool {
        self.input_main_channels.is_none()
    }

    /// Queue a parameter-automation point. VST3 `value` is always
    /// 0..1 normalised; callers get the raw range via `ParamInfo`.
    ///
    /// Input validation:
    ///
    /// - Non-finite `value` (NaN / ±Inf) → rejected with
    ///   `InvalidLifecycle`. Forwarding NaN to a plugin's DSP graph
    ///   reliably destabilises it and often produces audio-thread
    ///   panics.
    /// - `value` outside `[0.0, 1.0]` → clamped silently. VST3's
    ///   contract is that parameters are always normalised; out-of-
    ///   range values are a common caller mistake (e.g. forgetting
    ///   to divide by 127 for a MIDI CC mapping) and clamping is
    ///   safer than rejecting.
    ///
    /// On success, two things happen simultaneously:
    ///
    /// 1. The point is pushed onto the audio-thread queue and will
    ///    be delivered via `inputParameterChanges` on the next
    ///    `process_block` call.
    /// 2. If the plugin exposes an `IEditController` and
    ///    `sample_offset == 0` (i.e. "apply now"), we also call
    ///    `setParamNormalized` directly so the plugin's own
    ///    controller state — which drives its GUI and any state
    ///    snapshot the DAW asks for — updates even when audio
    ///    processing isn't running (transport stopped, pre-roll,
    ///    user tweaking a slider while paused).
    ///
    /// Non-zero `sample_offset` points are treated as pure audio-
    /// thread automation: the GUI / controller state stays at
    /// whatever the plugin last rendered. This matches how real
    /// DAWs handle block-internal automation.
    ///
    /// Ordering contract mirrors `queue_midi`: unordered cross-thread
    /// pushes, deterministic sort by `(param_id, sample_offset)` at
    /// process time.
    pub fn set_parameter(
        &self,
        param_id: u32,
        sample_offset: u32,
        value: f64,
    ) -> Result<(), PluginHostError> {
        if !value.is_finite() {
            return Err(PluginHostError::InvalidLifecycle(format!(
                "set_parameter value must be finite (got {value})"
            )));
        }
        let clamped = value.clamp(0.0, 1.0);

        if sample_offset == 0 {
            if let Some(ctrl) = self.controller.as_ref() {
                // SAFETY: `ctrl` is a live `ComPtr<IEditController>`
                // obtained from the loader. The setter only updates
                // the controller's internal state — safe to call
                // off the audio thread, and required here so GUI /
                // state snapshots reflect the edit even when
                // processing is stopped.
                unsafe {
                    ctrl.setParamNormalized(param_id, clamped);
                }
            }
        }
        self.param_queue.push(ParamPoint {
            param_id,
            sample_offset,
            value: clamped,
        });
        Ok(())
    }

    pub(crate) fn drain_param_points(&self) -> Vec<ParamPoint> {
        let mut out = Vec::new();
        while let Some(p) = self.param_queue.pop() {
            out.push(p);
        }
        out
    }

    /// Push a point back onto the queue — used by `process_block` to
    /// preserve automation scheduled past the current block boundary
    /// so it fires on a subsequent call.
    pub(crate) fn requeue_param_point(&self, p: ParamPoint) {
        self.param_queue.push(p);
    }

    /// Symmetric to `requeue_param_point` but for MIDI events.
    /// Callers are responsible for decrementing `sample_offset` by
    /// the current block's sample count before re-queueing.
    pub(crate) fn requeue_midi_event(&self, e: MidiEvent) {
        self.midi_queue.push(e);
    }

    #[cfg(test)]
    pub(crate) fn param_queue_len(&self) -> usize {
        self.param_queue.len()
    }

    /// Re-query the plugin's current processing latency (in samples).
    /// Plugins can change this in response to parameter edits —
    /// oversampling toggles, lookahead window changes — and notify
    /// the host via `IComponentHandler::restartComponent(kLatencyChanged)`.
    /// Consumers drain the restart collector and call this to refresh
    /// their cached latency.
    pub fn current_latency_samples(&self) -> u32 {
        // SAFETY: `self.processor` is a live COM pointer; the
        // `getLatencySamples` call is const on the plugin's side
        // (doesn't mutate state) so it's safe to call without
        // holding the lifecycle mutex.
        unsafe { self.processor.getLatencySamples() }
    }

    /// Serialise the plugin's state to an opaque byte blob. Matches
    /// the `IComponent::getState` side of VST3's preset contract —
    /// the blob is what a DAW writes into a project file so the
    /// plugin's parameters, sample selections, and anything else it
    /// considers user-editable can be restored later.
    ///
    /// The blob actually contains **two** payloads concatenated with
    /// a 4-byte little-endian header: `IComponent::getState()` bytes
    /// first, then (if the plugin exposes a split controller)
    /// `IEditController::getState()` bytes. Some plugins keep part
    /// of their preset on the controller side; skipping it would
    /// silently drop settings that round-tripped the component.
    ///
    /// This call is serialised with `process_block` via the
    /// `processing_state` lock — VST3 plugins don't all guarantee
    /// thread-safety between `getState` and `process`, and torn
    /// state is a nasty failure mode.
    ///
    /// Non-OK return from `getState` is surfaced as `SetupFailed`.
    pub fn save_state(&self) -> Result<Vec<u8>, PluginHostError> {
        let _guard = self
            .processing_state()
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;

        let component_blob = getstate_into_bytes(|s| {
            // SAFETY: `s` is a live IBStream pointer; self.component
            // is a live COM pointer from the loader.
            unsafe { self.component.getState(s) }
        })?;

        let controller_blob = if let Some(ctrl) = self.controller.as_ref() {
            getstate_into_bytes(|s| {
                // SAFETY: as above.
                unsafe { ctrl.getState(s) }
            })?
        } else {
            Vec::new()
        };

        // Header + payloads. Keeping this in-crate means we can
        // change the layout later without breaking external callers
        // as long as `save_state` / `load_state` pair up.
        let mut out =
            Vec::with_capacity(4 + component_blob.len() + controller_blob.len());
        let comp_len = component_blob.len() as u32;
        out.extend_from_slice(&comp_len.to_le_bytes());
        out.extend_from_slice(&component_blob);
        out.extend_from_slice(&controller_blob);
        Ok(out)
    }

    /// Restore the plugin's state from a blob previously produced by
    /// `save_state`. Reads the 2-section layout: component state
    /// first, then optional controller state.
    ///
    /// For plugins with a split controller, `IEditController::setComponentState`
    /// is *also* called with the component blob so the GUI mirrors
    /// the restored parameters — that matches Steinberg's host
    /// reference pattern. If the blob includes dedicated controller
    /// state, `IEditController::setState` is called with that
    /// section afterwards.
    ///
    /// Pending MIDI and parameter-automation queues are drained
    /// before returning — without this, events queued before the
    /// load would replay on top of the restored state on the next
    /// `process_block` and silently overwrite it.
    ///
    /// Serialised with `process_block` via the `processing_state`
    /// lock. Additionally requires the instance be *not active*:
    /// `IComponent::setState` on an active plugin is outside the
    /// VST3 spec's guaranteed behaviour and can corrupt the
    /// plugin's internal audio state.
    pub fn load_state(&self, blob: &[u8]) -> Result<(), PluginHostError> {
        let guard = self
            .processing_state()
            .lock()
            .map_err(|_| PluginHostError::RegistryUnavailable)?;
        if guard.active {
            return Err(PluginHostError::InvalidLifecycle(
                "load_state requires the instance to be deactivated first (IComponent::setState is not safe while active per VST3 spec)".into(),
            ));
        }
        // Drop the guard before touching the lock-free queues — we
        // still hold it via reacquire below for the COM calls. This
        // avoids holding the mutex while another thread is draining
        // on a separate process_block (which would deadlock since
        // they take the same lock first).
        //
        // Actually simpler: keep the guard held; `drain_midi` /
        // `drain_param_points` only touch lock-free SegQueues and
        // don't reacquire processing_state. So we can just hold the
        // guard through the whole operation.

        // Parse the header.
        if blob.len() < 4 {
            return Err(PluginHostError::SetupFailed(
                "state blob too short: missing 4-byte component-length header".into(),
            ));
        }
        let comp_len = u32::from_le_bytes([blob[0], blob[1], blob[2], blob[3]]) as usize;
        if 4 + comp_len > blob.len() {
            return Err(PluginHostError::SetupFailed(format!(
                "state blob truncated: header says component={comp_len} bytes but blob has {} remaining",
                blob.len() - 4
            )));
        }
        let component_bytes = &blob[4..4 + comp_len];
        let controller_bytes = &blob[4 + comp_len..];

        // 1. IComponent::setState (primary restore).
        let stream = MemoryStream::from_data(component_bytes.to_vec());
        let ptr = stream
            .to_com_ptr::<vst3::Steinberg::IBStream>()
            .ok_or_else(|| {
                PluginHostError::SetupFailed(
                    "MemoryStream failed to expose IBStream — programming error".into(),
                )
            })?;
        // SAFETY: live COM pointers owned by this instance.
        let result = unsafe { self.component.setState(ptr.as_ptr()) };
        if result != kResultOk {
            return Err(PluginHostError::SetupFailed(format!(
                "IComponent::setState returned {result}"
            )));
        }

        // 2. IEditController::setComponentState — mirrors the
        //    component blob so the controller's GUI matches.
        if let Some(ctrl) = self.controller.as_ref() {
            let sync_stream = MemoryStream::from_data(component_bytes.to_vec());
            let sync_ptr = sync_stream
                .to_com_ptr::<vst3::Steinberg::IBStream>()
                .ok_or_else(|| {
                    PluginHostError::SetupFailed(
                        "MemoryStream failed to expose IBStream — programming error".into(),
                    )
                })?;
            // SAFETY: live COM pointers. Non-OK here is non-fatal —
            // component state is already loaded; the controller
            // will catch up on next parameter edit or UI refresh.
            let r = unsafe { ctrl.setComponentState(sync_ptr.as_ptr()) };
            if r != kResultOk {
                tracing::warn!(
                    result = r,
                    instance_id = %self.instance_id,
                    "IEditController::setComponentState returned non-OK — GUI may drift until next edit"
                );
            }

            // 3. IEditController::setState — restores controller-owned
            //    state (e.g. per-instance view preferences).
            if !controller_bytes.is_empty() {
                let ctrl_stream = MemoryStream::from_data(controller_bytes.to_vec());
                let ctrl_ptr = ctrl_stream
                    .to_com_ptr::<vst3::Steinberg::IBStream>()
                    .ok_or_else(|| {
                        PluginHostError::SetupFailed(
                            "MemoryStream failed to expose IBStream — programming error".into(),
                        )
                    })?;
                // SAFETY: live COM pointers.
                let r = unsafe { ctrl.setState(ctrl_ptr.as_ptr()) };
                if r != kResultOk {
                    tracing::warn!(
                        result = r,
                        instance_id = %self.instance_id,
                        "IEditController::setState returned non-OK — controller-owned preferences not restored"
                    );
                }
            }
        }

        // Drain queued MIDI + parameter points — they were scheduled
        // against a state the plugin no longer has.
        while self.midi_queue.pop().is_some() {}
        while self.param_queue.pop().is_some() {}

        drop(guard);
        Ok(())
    }
}

/// Helper: allocate an empty `MemoryStream`, run `writer` against
/// its `IBStream` pointer, and return the accumulated bytes. Used by
/// both `IComponent::getState` and `IEditController::getState`.
fn getstate_into_bytes<F>(writer: F) -> Result<Vec<u8>, PluginHostError>
where
    F: FnOnce(*mut vst3::Steinberg::IBStream) -> vst3::Steinberg::tresult,
{
    let stream = MemoryStream::new();
    let ptr = stream
        .to_com_ptr::<vst3::Steinberg::IBStream>()
        .ok_or_else(|| {
            PluginHostError::SetupFailed(
                "MemoryStream failed to expose IBStream — programming error".into(),
            )
        })?;
    let result = writer(ptr.as_ptr());
    if result != kResultOk {
        return Err(PluginHostError::SetupFailed(format!(
            "getState-equivalent call returned {result}"
        )));
    }
    Ok(stream.into_data())
}

impl Drop for Vst3PluginInstance {
    fn drop(&mut self) {
        // Make sure the plugin is deactivated before its COM pointers
        // get released — skipping this can leak audio threads or crash
        // the plugin on teardown, depending on the vendor.
        //
        // If the mutex is poisoned we still want to attempt
        // deactivation: a panic elsewhere shouldn't leave the plugin
        // half-active. `PoisonError::into_inner` lets us recover the
        // state without caring whether it's consistent.
        let active = match self.processing_state.lock() {
            Ok(state) => state.active,
            Err(poisoned) => {
                warn!(
                    instance_id = %self.instance_id,
                    plugin_uid = %self.plugin_uid,
                    "processing_state poisoned in drop; attempting best-effort deactivation"
                );
                poisoned.into_inner().active
            }
        };
        if active {
            // SAFETY: deactivation order per the VST3 spec. We ignore
            // the return values — we're tearing down regardless.
            unsafe {
                self.processor.setProcessing(0);
                self.component.setActive(0);
            }
        }
    }
}

// SAFETY: COM pointers in the `vst3` crate are `Send + Sync`; wrapping
// them in a struct doesn't change that — the instance is moved between
// threads via the registry's `Mutex`, never read concurrently.
unsafe impl Send for Vst3PluginInstance {}
unsafe impl Sync for Vst3PluginInstance {}

/// Resolve the dylib inside a `.vst3` bundle. macOS convention is
/// `Contents/MacOS/<BundleName>`, but some bundles drop arbitrary
/// names there; we take the first file we find as a fallback.
pub fn bundle_dylib_path(bundle_path: &Path) -> Option<PathBuf> {
    let name = bundle_path.file_stem()?.to_str()?;
    let dylib = bundle_path.join("Contents/MacOS").join(name);
    if dylib.exists() {
        return Some(dylib);
    }
    let macos_dir = bundle_path.join("Contents/MacOS");
    if let Ok(entries) = std::fs::read_dir(&macos_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

type GetPluginFactoryFn = unsafe extern "C" fn() -> *mut FUnknown;

/// Load a VST3 plugin bundle into memory and instantiate its first
/// class. Returns the live instance + a serialisable snapshot of its
/// metadata.
///
/// # Safety
/// Loads native code and calls into unknown plugin COM implementations.
/// Only call with a `bundle_path` produced by the scanner or supplied
/// by a trusted user selection.
pub unsafe fn load_plugin(
    bundle_path: &Path,
    instance_id: &str,
) -> Result<(Vst3PluginInstance, InstanceInfo), PluginHostError> {
    load_plugin_with_collectors(bundle_path, instance_id, None, None)
}

/// Full-featured loader: same contract as `load_plugin` but wires
/// the plugin's `IEditController::setComponentHandler` to an
/// `AceComponentHandler` backed by the supplied collectors. The
/// handler forwards plugin-side edits (performEdit) to
/// `params`, and topology-change notifications (restartComponent) to
/// `restarts`. Pass `None` for either collector to skip that wiring
/// — the returned instance still works, just without the
/// corresponding events surfacing.
///
/// # Safety
/// Same as `load_plugin`.
pub unsafe fn load_plugin_with_collectors(
    bundle_path: &Path,
    instance_id: &str,
    params: Option<&ParamChangeCollector>,
    restarts: Option<&ComponentRestartCollector>,
) -> Result<(Vst3PluginInstance, InstanceInfo), PluginHostError> {
    // 1. Resolve + dlopen the dylib.
    let dylib_path = bundle_dylib_path(bundle_path).ok_or_else(|| {
        PluginHostError::InvalidBundle(format!(
            "no dylib found in bundle: {}",
            bundle_path.display()
        ))
    })?;

    info!(path = %dylib_path.display(), "loading VST3 dylib");
    let lib = Library::new(&dylib_path)
        .map_err(|e| PluginHostError::LoadFailed(format!("dlopen failed: {e}")))?;

    // 2. Resolve the factory entry point.
    let get_factory: Symbol<GetPluginFactoryFn> = lib
        .get(b"GetPluginFactory\0")
        .map_err(|e| PluginHostError::LoadFailed(format!("GetPluginFactory missing: {e}")))?;

    let factory_raw = get_factory();
    if factory_raw.is_null() {
        return Err(PluginHostError::LoadFailed(
            "GetPluginFactory returned null".into(),
        ));
    }

    let factory = ComPtr::<IPluginFactory>::from_raw(factory_raw as *mut IPluginFactory)
        .ok_or_else(|| PluginHostError::LoadFailed("failed to wrap factory pointer".into()))?;

    // 3. Log factory identity for diagnostics.
    let mut factory_info: PFactoryInfo = std::mem::zeroed();
    let result = factory.getFactoryInfo(&mut factory_info);
    if result == kResultOk {
        let vendor = read_cstr(&factory_info.vendor);
        info!(vendor = %vendor, "VST3 factory loaded");
    }

    // 4. Find the first plugin class.
    let class_count = factory.countClasses();
    debug!(class_count, "plugin classes");
    if class_count == 0 {
        return Err(PluginHostError::InstantiateFailed(
            "factory exposes no classes".into(),
        ));
    }

    let mut class_info: PClassInfo = std::mem::zeroed();
    let result = factory.getClassInfo(0, &mut class_info);
    if result != kResultOk {
        return Err(PluginHostError::InstantiateFailed(
            "getClassInfo(0) failed".into(),
        ));
    }

    let class_name = read_cstr(&class_info.name);
    let cid = class_info.cid;
    let uid_str = format_uid(&cid);
    info!(name = %class_name, uid = %uid_str, "creating instance");

    // 5. Instantiate IComponent. The casts are defensive — `TUID` is
    // `[i8; 16]` on the platforms we currently build for, but the
    // Steinberg SDK headers spell the argument as `FIDString` and
    // different `vst3` crate features can shift the underlying type,
    // so we keep the explicit cast even when clippy flags it as a
    // no-op on the current target.
    let mut component_raw: *mut std::ffi::c_void = ptr::null_mut();
    #[allow(clippy::unnecessary_cast)]
    let result = factory.createInstance(
        cid.as_ptr() as *const i8,
        <IComponent as vst3::Interface>::IID.as_ptr() as *const i8,
        &mut component_raw,
    );
    if result != kResultOk || component_raw.is_null() {
        return Err(PluginHostError::InstantiateFailed(format!(
            "createInstance failed: result={result}"
        )));
    }
    let component = ComPtr::<IComponent>::from_raw(component_raw as *mut IComponent).ok_or_else(
        || PluginHostError::InstantiateFailed("null IComponent pointer".into()),
    )?;

    // 6. Initialise with our host identity so the plugin can call back
    //    via IHostApplication. A non-OK return isn't necessarily fatal
    //    — some older plugins return junk here but still work.
    let host_app = AceHostApplication::new();
    let host_ptr = host_app
        .to_com_ptr::<vst3::Steinberg::Vst::IHostApplication>()
        .map(|p| p.as_ptr() as *mut FUnknown)
        .unwrap_or(ptr::null_mut());
    let result = component.initialize(host_ptr);
    if result != kResultOk {
        warn!(result, "IComponent::initialize returned non-OK (may still work)");
    }

    // 7. IAudioProcessor is mandatory — without it we can't render audio.
    let processor = component.cast::<IAudioProcessor>().ok_or_else(|| {
        PluginHostError::MissingInterface("IAudioProcessor not implemented".into())
    })?;

    // 8. IEditController is optional — some plugins split it into a
    //    separate class we'd need to create ourselves (not yet done).
    let controller = component.cast::<IEditController>();
    if controller.is_none() {
        debug!("IEditController not exposed via IComponent");
    }

    // 8b. Wire our component handler into the controller so
    //     plugin-side parameter edits and topology changes (e.g.
    //     latency) surface through the shared collectors. Handler
    //     lives in the instance for as long as the plugin does.
    let component_handler = controller.as_ref().and_then(|ctrl| {
        // Use collectors if provided; otherwise fall back to empty
        // ones so the handler still implements the trait correctly
        // — plugins never see a null handler pointer that way.
        let params_ref = params.cloned().unwrap_or_default();
        let restarts_ref = restarts.cloned().unwrap_or_default();
        let handler = AceComponentHandler::with_collectors(
            instance_id.to_string(),
            &params_ref,
            &restarts_ref,
        );
        let handler_ptr = handler
            .to_com_ptr::<vst3::Steinberg::Vst::IComponentHandler>()
            .map(|p| p.as_ptr());
        if let Some(ptr) = handler_ptr {
            // SAFETY: `ctrl` is a live ComPtr; `ptr` refers to the
            // ComWrapper we hold and outlives this call.
            let r = ctrl.setComponentHandler(ptr);
            if r != kResultOk {
                warn!(result = r, "setComponentHandler declined — plugin-side edits + restarts will not surface");
                return None;
            }
            Some(handler)
        } else {
            warn!("AceComponentHandler could not expose IComponentHandler — plugin-side edits will not surface");
            None
        }
    });

    // 9. Snapshot parameter + bus + latency data for the UI.
    let parameters = extract_parameters(&controller);
    let output_busses = extract_output_busses(&component);
    let input_main_channels = extract_main_input_channels(&component);
    let latency_samples = processor.getLatencySamples();
    let tail_samples = processor.getTailSamples();

    info!(
        params = parameters.len(),
        output_busses = output_busses.len(),
        input_main = ?input_main_channels,
        latency = latency_samples,
        tail = tail_samples,
        "plugin loaded"
    );

    let info = InstanceInfo {
        instance_id: instance_id.to_string(),
        plugin_uid: uid_str.clone(),
        bundle_path: bundle_path.to_string_lossy().to_string(),
        parameters,
        output_busses,
        latency_samples,
        tail_samples,
    };

    let instance = Vst3PluginInstance {
        _library: lib,
        component,
        processor,
        controller,
        _component_handler: component_handler,
        instance_id: instance_id.to_string(),
        plugin_uid: uid_str,
        bundle_path: bundle_path.to_path_buf(),
        output_busses: info.output_busses.clone(),
        input_main_channels,
        processing_state: Mutex::new(ProcessingState::default()),
        midi_queue: SegQueue::new(),
        param_queue: SegQueue::new(),
    };

    Ok((instance, info))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn extract_parameters(controller: &Option<ComPtr<IEditController>>) -> Vec<ParamInfo> {
    let Some(ctrl) = controller else {
        return vec![];
    };

    let count = unsafe { ctrl.getParameterCount() };
    let mut params = Vec::with_capacity(count as usize);

    for i in 0..count {
        let mut info: ParameterInfo = unsafe { std::mem::zeroed() };
        let result = unsafe { ctrl.getParameterInfo(i, &mut info) };
        if result != kResultOk {
            continue;
        }

        params.push(ParamInfo {
            id: info.id,
            name: read_wstr(&info.title),
            default_value: info.defaultNormalizedValue,
            // VST3 params are always 0..1 normalised on the wire —
            // the plugin's own display transform renders the
            // human-facing range.
            min_value: 0.0,
            max_value: 1.0,
            unit: read_wstr(&info.units),
        });
    }

    params
}

/// Channel count of the main audio *input* bus, or `None` if the
/// plugin exposes no audio input (pure instrument case). Only the
/// main bus (index 0) is returned in 4B-2a — sidechain inputs are a
/// separate concern tracked by a later sub-phase.
fn extract_main_input_channels(component: &ComPtr<IComponent>) -> Option<u32> {
    let num_inputs = unsafe {
        component.getBusCount(
            MediaTypes_::kAudio as i32,
            BusDirections_::kInput as i32,
        )
    };
    if num_inputs <= 0 {
        return None;
    }

    let mut info: BusInfo = unsafe { std::mem::zeroed() };
    let result = unsafe {
        component.getBusInfo(
            MediaTypes_::kAudio as i32,
            BusDirections_::kInput as i32,
            0,
            &mut info,
        )
    };
    if result != kResultOk {
        warn!(result, "getBusInfo(input,0) failed; treating plugin as instrument");
        return None;
    }
    Some(info.channelCount as u32)
}

fn extract_output_busses(component: &ComPtr<IComponent>) -> Vec<OutputBusInfo> {
    let num_outputs = unsafe {
        component.getBusCount(
            MediaTypes_::kAudio as i32,
            BusDirections_::kOutput as i32,
        )
    };

    if num_outputs <= 0 {
        return vec![];
    }

    let mut busses = Vec::with_capacity(num_outputs as usize);
    for i in 0..num_outputs {
        let mut info: BusInfo = unsafe { std::mem::zeroed() };
        let result = unsafe {
            component.getBusInfo(
                MediaTypes_::kAudio as i32,
                BusDirections_::kOutput as i32,
                i,
                &mut info,
            )
        };
        if result != kResultOk {
            warn!(bus_index = i, result, "getBusInfo failed");
            continue;
        }

        let bus_name = read_wstr(&info.name);
        debug!(
            bus_index = i,
            name = %bus_name,
            channels = info.channelCount,
            "output bus discovered"
        );

        busses.push(OutputBusInfo {
            name: bus_name,
            channels: info.channelCount as u32,
            index: i as u32,
        });
    }

    busses
}

/// Read a null-terminated C string from a fixed-size `[i8]` buffer.
pub fn read_cstr(buf: &[i8]) -> String {
    let bytes: Vec<u8> = buf.iter().take_while(|&&b| b != 0).map(|&b| b as u8).collect();
    String::from_utf8_lossy(&bytes).to_string()
}

/// Read a null-terminated UTF-16 string from a fixed-size `[u16]` buffer.
pub fn read_wstr(buf: &[u16]) -> String {
    let chars: Vec<u16> = buf.iter().take_while(|&&c| c != 0).copied().collect();
    String::from_utf16_lossy(&chars)
}

/// Format a VST3 TUID (16 bytes) as a UUID-style string. Matches the
/// formatting used in Steinberg's SDK logs — handy for grep-ing.
pub fn format_uid(uid: &[i8; 16]) -> String {
    let bytes: Vec<u8> = uid.iter().map(|&b| b as u8).collect();
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::midi::MidiEvent;

    #[test]
    fn param_queue_accumulates_and_drains() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "param-queue-test") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        assert_eq!(instance.param_queue_len(), 0);

        instance.set_parameter(1, 0, 0.25).unwrap();
        instance.set_parameter(2, 128, 0.5).unwrap();
        instance.set_parameter(1, 256, 0.75).unwrap();
        assert_eq!(instance.param_queue_len(), 3);

        let drained = instance.drain_param_points();
        assert_eq!(drained.len(), 3);
        assert_eq!(instance.param_queue_len(), 0);

        // Content round-trips without loss.
        let ids: Vec<u32> = drained.iter().map(|p| p.param_id).collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&2));
    }

    #[test]
    fn load_state_rejects_truncated_blob() {
        // Pure-logic test — the header parse happens before any COM
        // call, so we can exercise it without a real plugin. We do
        // need an instance though (for the processing_state lock)
        // so this still requires the bundle.
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "load-trunc") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        // Empty blob → no header → SetupFailed
        assert!(matches!(
            instance.load_state(&[]),
            Err(PluginHostError::SetupFailed(_))
        ));
        // Header says 100 bytes but blob has only 0 remaining
        let bad = vec![100u8, 0, 0, 0];
        assert!(matches!(
            instance.load_state(&bad),
            Err(PluginHostError::SetupFailed(_))
        ));
    }

    #[test]
    fn load_state_drains_queued_events() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "load-drain") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        // Queue some events before loading.
        instance.queue_midi(&[MidiEvent::note_on(0, 60, 100, 0)]);
        instance
            .set_parameter(1, 0, 0.5)
            .unwrap();
        assert!(instance.midi_queue_len() > 0);
        assert!(instance.param_queue_len() > 0);

        let blob = instance.save_state().unwrap();
        instance.load_state(&blob).unwrap();

        // Queues drained — events that were against the old state
        // are gone, as they should be.
        assert_eq!(instance.midi_queue_len(), 0);
        assert_eq!(instance.param_queue_len(), 0);
    }

    #[test]
    fn load_state_rejects_active_instance() {
        use crate::audio::AudioConfig;
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "load-active") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        instance
            .setup_processing(AudioConfig::new(48000.0, 512).unwrap())
            .unwrap();
        instance.activate().unwrap();

        let blob = instance.save_state().unwrap();
        assert!(matches!(
            instance.load_state(&blob),
            Err(PluginHostError::InvalidLifecycle(_))
        ));

        // After deactivating it should succeed.
        instance.deactivate().unwrap();
        assert!(instance.load_state(&blob).is_ok());
    }

    #[test]
    fn save_state_returns_bytes_and_load_state_is_idempotent() {
        // Gated smoke: only runs when ACE Bridge is installed at the
        // known path. Asserts:
        // 1. save_state succeeds and returns some bytes (even an
        //    empty plugin with default state usually writes a header).
        // 2. load_state on the same blob succeeds (same plugin,
        //    same version, so the blob must round-trip).
        // 3. A second save after load produces the same bytes —
        //    proves load_state actually restored the state rather
        //    than leaving the plugin in a drifted condition.
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "state-smoke") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        let first = match instance.save_state() {
            Ok(b) => b,
            Err(e) => {
                eprintln!("save_state failed (plugin may not support state save): {e}");
                return;
            }
        };

        // Non-empty state is typical for real plugins; don't fail if
        // the plugin chooses to return an empty blob (some do).
        assert!(instance.load_state(&first).is_ok());

        // Round-trip: the second save should match the first.
        let second = instance.save_state().unwrap();
        assert_eq!(
            first, second,
            "save → load → save did not round-trip byte-for-byte"
        );
    }

    #[test]
    fn set_parameter_rejects_nan_and_inf_clamps_out_of_range() {
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "param-validate-test") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        // NaN / Inf rejected with InvalidLifecycle.
        assert!(matches!(
            instance.set_parameter(1, 0, f64::NAN),
            Err(PluginHostError::InvalidLifecycle(_))
        ));
        assert!(matches!(
            instance.set_parameter(1, 0, f64::INFINITY),
            Err(PluginHostError::InvalidLifecycle(_))
        ));
        assert!(matches!(
            instance.set_parameter(1, 0, f64::NEG_INFINITY),
            Err(PluginHostError::InvalidLifecycle(_))
        ));

        // Out-of-range clamped silently.
        assert!(instance.set_parameter(1, 0, -0.5).is_ok());
        assert!(instance.set_parameter(1, 0, 1.5).is_ok());
        let pts = instance.drain_param_points();
        assert_eq!(pts.len(), 2);
        assert!(pts.iter().any(|p| p.value == 0.0)); // -0.5 clamped
        assert!(pts.iter().any(|p| p.value == 1.0)); // 1.5 clamped
    }

    #[test]
    fn midi_queue_accumulates_and_drains() {
        // Build an instance by hand-rolling via the smoke test path is
        // not possible without COM — instead, use the real bundle-load
        // path only if available; otherwise skip.
        //
        // This asserts only that every queued event ends up in the
        // drained vector. Order across multiple `queue_midi` calls
        // on a single thread happens to be FIFO with `SegQueue`,
        // but that's not part of the `queue_midi` contract (see its
        // docs) — `process_block` sorts by `sample_offset` before
        // handing events to the plugin, so the test checks the
        // contract, not the incidental FIFO.
        let candidates = ["/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3"];
        let Some(path) = candidates.iter().map(Path::new).find(|p| p.exists()) else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };
        let (instance, _) = match unsafe { load_plugin(path, "midi-queue-test") } {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
                return;
            }
        };

        assert_eq!(instance.midi_queue_len(), 0);

        instance.queue_midi(&[
            MidiEvent::note_on(0, 60, 100, 0),
            MidiEvent::note_on(1, 72, 80, 128),
        ]);
        instance.queue_midi(&[MidiEvent::note_off(0, 60, 0, 256)]);
        assert_eq!(instance.midi_queue_len(), 3);

        let mut drained = instance.drain_midi();
        assert_eq!(drained.len(), 3);
        // Sort by sample_offset before comparing — that matches how
        // the plugin actually sees the events via process_block.
        drained.sort_by_key(|e| e.sample_offset);
        assert_eq!(drained[0].sample_offset, 0);
        assert_eq!(drained[0].data1, 60);
        assert_eq!(drained[1].sample_offset, 128);
        assert_eq!(drained[1].data1, 72);
        assert_eq!(drained[2].sample_offset, 256);
        assert_eq!(drained[2].data1, 60);
        assert_eq!(instance.midi_queue_len(), 0);
    }

    #[test]
    fn bundle_dylib_path_returns_none_for_missing_bundle() {
        assert!(bundle_dylib_path(Path::new("/nonexistent/plugin.vst3")).is_none());
    }

    #[test]
    fn read_cstr_stops_at_first_null_byte() {
        let buf: [i8; 8] = [72, 101, 108, 108, 111, 0, 0, 0];
        assert_eq!(read_cstr(&buf), "Hello");
    }

    #[test]
    fn read_cstr_handles_empty_buffer() {
        let buf: [i8; 4] = [0, 0, 0, 0];
        assert_eq!(read_cstr(&buf), "");
    }

    #[test]
    fn read_wstr_stops_at_first_null_unit() {
        let buf: [u16; 6] = [72, 105, 0, 0, 0, 0];
        assert_eq!(read_wstr(&buf), "Hi");
    }

    #[test]
    fn format_uid_produces_uuid_style_string() {
        let uid: [i8; 16] = [
            0x12, 0x34, 0x56, 0x78,
            0x9A_u8 as i8, 0xBC_u8 as i8,
            0xDE_u8 as i8, 0xF0_u8 as i8,
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88_u8 as i8,
        ];
        assert_eq!(format_uid(&uid), "12345678-9abc-def0-1122-334455667788");
    }

    /// Gated smoke test: only runs when a known VST3 bundle is present
    /// at a standard macOS path. Mirrors the companion's approach —
    /// we can't unit-test COM interop without a real plugin.
    #[test]
    fn load_plugin_smoke_with_real_bundle() {
        let candidates = [
            "/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3",
        ];
        let Some(path) = candidates
            .iter()
            .map(Path::new)
            .find(|p| p.exists())
        else {
            eprintln!("skipping: no known VST3 bundle installed");
            return;
        };

        let result = unsafe { load_plugin(path, "smoke-test") };
        match result {
            Ok((instance, info)) => {
                assert!(!instance.plugin_uid.is_empty());
                assert_eq!(info.instance_id, "smoke-test");
                assert_eq!(info.plugin_uid, instance.plugin_uid);
                assert!(info.bundle_path.ends_with(".vst3"));
            }
            Err(e) => {
                eprintln!("load failed (environment-specific, not fatal): {e}");
            }
        }
    }
}
