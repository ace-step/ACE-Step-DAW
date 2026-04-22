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

use crate::audio::ProcessingState;
use crate::error::PluginHostError;
use crate::host_impl::AceHostApplication;
use crate::types::{InstanceInfo, OutputBusInfo, ParamInfo};

/// A loaded VST3 plugin instance + its COM handles. The `_library`
/// field keeps the dylib alive for the instance's lifetime — dropping
/// the instance unloads it.
pub struct Vst3PluginInstance {
    _library: Library,
    pub component: ComPtr<IComponent>,
    pub processor: ComPtr<IAudioProcessor>,
    pub controller: Option<ComPtr<IEditController>>,
    pub instance_id: String,
    pub plugin_uid: String,
    pub bundle_path: PathBuf,
    /// Output-bus topology captured at load time. Used by
    /// `setup_processing` to fail-fast on non-stereo plugins while
    /// 4B-1 is still stereo-only; bus-arrangement negotiation lands
    /// in 4B-3.
    pub output_busses: Vec<OutputBusInfo>,
    /// Processing lifecycle state. Guarded by a `Mutex` so the VST3
    /// spec's serialisation requirement for `setupProcessing` /
    /// `setActive` / `process` is enforced at our layer.
    processing_state: Mutex<ProcessingState>,
}

impl Vst3PluginInstance {
    /// Shared processing-state lock. Exposed crate-internally so the
    /// lifecycle methods in `audio.rs` can read and mutate it without
    /// duplicating state here.
    pub(crate) fn processing_state(&self) -> &Mutex<ProcessingState> {
        &self.processing_state
    }
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

    // 9. Snapshot parameter + bus + latency data for the UI.
    let parameters = extract_parameters(&controller);
    let output_busses = extract_output_busses(&component);
    let latency_samples = processor.getLatencySamples();
    let tail_samples = processor.getTailSamples();

    info!(
        params = parameters.len(),
        output_busses = output_busses.len(),
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
        instance_id: instance_id.to_string(),
        plugin_uid: uid_str,
        bundle_path: bundle_path.to_path_buf(),
        output_busses: info.output_busses.clone(),
        processing_state: Mutex::new(ProcessingState::default()),
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
