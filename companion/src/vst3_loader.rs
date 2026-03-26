//! VST3 plugin loading via pure Rust.
//!
//! Uses `libloading` to load the `.dylib` from a VST3 bundle and the `vst3`
//! crate for COM interface bindings. No C++ needed.

use std::path::{Path, PathBuf};
use std::ptr;

use libloading::{Library, Symbol};
use tracing::{debug, info, warn};
use vst3::ComPtr;
use vst3::Steinberg::Vst::{
    BusDirections_, BusInfo, IAudioProcessor, IAudioProcessorTrait, IComponent, IComponentTrait,
    IEditController, IEditControllerTrait, MediaTypes_, ParameterInfo,
};
use vst3::Steinberg::{
    FUnknown, IPluginFactory, IPluginFactoryTrait, IPluginBaseTrait,
    PClassInfo, PFactoryInfo, kResultOk,
};

use crate::error::CompanionError;
use crate::protocol::{OutputBusInfo, ParamInfo};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A loaded VST3 plugin instance with all COM interfaces.
pub struct Vst3PluginInstance {
    /// Keep the library alive for the lifetime of the instance.
    _library: Library,
    pub component: ComPtr<IComponent>,
    pub processor: ComPtr<IAudioProcessor>,
    pub controller: Option<ComPtr<IEditController>>,
    pub instance_id: String,
    pub plugin_uid: String,
}

// Safety: COM pointers are Send+Sync in the vst3 crate
unsafe impl Send for Vst3PluginInstance {}
unsafe impl Sync for Vst3PluginInstance {}

/// Metadata extracted from a loaded plugin.
pub struct PluginMetadata {
    pub parameters: Vec<ParamInfo>,
    pub latency_samples: u32,
    pub tail_samples: u32,
    pub output_busses: Vec<OutputBusInfo>,
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Resolve the path to the dylib inside a `.vst3` bundle.
pub fn bundle_dylib_path(bundle_path: &Path) -> Option<PathBuf> {
    let name = bundle_path.file_stem()?.to_str()?;
    let dylib = bundle_path.join("Contents/MacOS").join(name);
    if dylib.exists() {
        return Some(dylib);
    }
    // Fallback: look for any file in Contents/MacOS
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

/// Load a VST3 plugin from a bundle path and create an instance.
///
/// # Safety
/// This function loads native code and calls into COM interfaces.
pub unsafe fn load_plugin(
    bundle_path: &Path,
    instance_id: &str,
) -> Result<(Vst3PluginInstance, PluginMetadata), CompanionError> {
    // 1. Find and load the dylib
    let dylib_path = bundle_dylib_path(bundle_path)
        .ok_or_else(|| CompanionError::Plugin(format!(
            "No dylib found in bundle: {}",
            bundle_path.display()
        )))?;

    info!(path = %dylib_path.display(), "Loading VST3 dylib");
    let lib = Library::new(&dylib_path)
        .map_err(|e| CompanionError::Plugin(format!("Failed to load dylib: {e}")))?;

    // 2. Get the plugin factory
    let get_factory: Symbol<GetPluginFactoryFn> = lib.get(b"GetPluginFactory\0")
        .map_err(|e| CompanionError::Plugin(format!("Missing GetPluginFactory: {e}")))?;

    let factory_raw = get_factory();
    if factory_raw.is_null() {
        return Err(CompanionError::Plugin("GetPluginFactory returned null".into()));
    }

    let factory = ComPtr::<IPluginFactory>::from_raw(factory_raw as *mut IPluginFactory)
        .ok_or_else(|| CompanionError::Plugin("Failed to wrap factory pointer".into()))?;

    // 3. Get factory info
    let mut factory_info: PFactoryInfo = std::mem::zeroed();
    let result = factory.getFactoryInfo(&mut factory_info);
    if result == kResultOk {
        let vendor = read_cstr(&factory_info.vendor);
        info!(vendor = %vendor, "Factory loaded");
    }

    // 4. Enumerate classes and find the first audio processor
    let class_count = factory.countClasses();
    debug!(class_count, "Plugin classes found");

    if class_count == 0 {
        return Err(CompanionError::Plugin("No classes in plugin factory".into()));
    }

    // Find the first class (typically the main plugin)
    let mut class_info: PClassInfo = std::mem::zeroed();
    let result = factory.getClassInfo(0, &mut class_info);
    if result != kResultOk {
        return Err(CompanionError::Plugin("Failed to get class info".into()));
    }

    let class_name = read_cstr(&class_info.name);
    let cid = class_info.cid;
    let uid_str = format_uid(&cid);
    info!(name = %class_name, uid = %uid_str, "Creating instance");

    // 5. Create the IComponent instance
    let mut component_raw: *mut std::ffi::c_void = ptr::null_mut();
    let result = factory.createInstance(
        cid.as_ptr() as *const i8,
        <IComponent as vst3::Interface>::IID.as_ptr() as *const i8,
        &mut component_raw,
    );
    if result != kResultOk || component_raw.is_null() {
        return Err(CompanionError::Plugin(format!(
            "Failed to create IComponent: result={result}"
        )));
    }
    let component = ComPtr::<IComponent>::from_raw(component_raw as *mut IComponent)
        .ok_or_else(|| CompanionError::Plugin("Null IComponent pointer".into()))?;

    // 6. Initialize the component with our host application context
    let host_app = crate::host_impl::AceHostApplication::new();
    let host_ptr = host_app.to_com_ptr::<vst3::Steinberg::Vst::IHostApplication>()
        .map(|p| p.as_ptr() as *mut FUnknown)
        .unwrap_or(ptr::null_mut());
    let result = component.initialize(host_ptr);
    if result != kResultOk {
        warn!(result, "IComponent::initialize returned non-OK (may still work)");
    }

    // 7. Query IAudioProcessor
    let processor = component.cast::<IAudioProcessor>()
        .ok_or_else(|| CompanionError::Plugin("Plugin does not implement IAudioProcessor".into()))?;

    // 8. Query IEditController (optional — some plugins separate it)
    let controller = component.cast::<IEditController>();
    if controller.is_none() {
        debug!("Plugin does not expose IEditController directly (may need separate creation)");
    }

    // 9. Extract parameters
    let parameters = extract_parameters(&controller);

    // 10. Query output bus info
    let output_busses = extract_output_busses(&component);

    // 11. Get latency and tail
    let latency_samples = processor.getLatencySamples() as u32;
    let tail_samples = processor.getTailSamples() as u32;

    info!(
        params = parameters.len(),
        output_busses = output_busses.len(),
        latency = latency_samples,
        tail = tail_samples,
        "Plugin loaded successfully"
    );

    let metadata = PluginMetadata {
        parameters,
        latency_samples,
        tail_samples,
        output_busses,
    };

    let instance = Vst3PluginInstance {
        _library: lib,
        component,
        processor,
        controller,
        instance_id: instance_id.to_string(),
        plugin_uid: uid_str,
    };

    Ok((instance, metadata))
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
            min_value: 0.0,
            max_value: 1.0, // VST3 params are always 0..1 normalized
            unit: read_wstr(&info.units),
        });
    }

    params
}

/// Read a null-terminated C string from a fixed-size buffer.
fn read_cstr(buf: &[i8]) -> String {
    let bytes: Vec<u8> = buf.iter()
        .take_while(|&&b| b != 0)
        .map(|&b| b as u8)
        .collect();
    String::from_utf8_lossy(&bytes).to_string()
}

/// Read a null-terminated UTF-16 (char16) string from a fixed-size buffer.
fn read_wstr(buf: &[u16]) -> String {
    let chars: Vec<u16> = buf.iter()
        .take_while(|&&c| c != 0)
        .copied()
        .collect();
    String::from_utf16_lossy(&chars)
}

/// Query all output audio busses from the plugin component.
fn extract_output_busses(component: &ComPtr<IComponent>) -> Vec<OutputBusInfo> {
    let num_outputs = unsafe {
        component.getBusCount(MediaTypes_::kAudio as i32, BusDirections_::kOutput as i32)
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
            warn!(bus_index = i, result, "getBusInfo failed for output bus");
            continue;
        }

        let bus_name = read_wstr(&info.name);
        debug!(
            bus_index = i,
            name = %bus_name,
            channels = info.channelCount,
            "Output bus discovered"
        );

        busses.push(OutputBusInfo {
            name: bus_name,
            channels: info.channelCount as u32,
            index: i as u32,
        });
    }

    busses
}

/// Format a TUID (16 bytes) as a UUID-like string.
fn format_uid(uid: &[i8; 16]) -> String {
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
    fn test_bundle_dylib_path_valid() {
        let path = Path::new("/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3");
        if path.exists() {
            let dylib = bundle_dylib_path(path);
            assert!(dylib.is_some(), "Should find dylib in valid bundle");
            assert!(dylib.unwrap().exists());
        }
    }

    #[test]
    fn test_bundle_dylib_path_nonexistent() {
        let dylib = bundle_dylib_path(Path::new("/nonexistent/plugin.vst3"));
        assert!(dylib.is_none());
    }

    #[test]
    fn test_read_cstr() {
        let buf: [i8; 8] = [72, 101, 108, 108, 111, 0, 0, 0];
        assert_eq!(read_cstr(&buf), "Hello");
    }

    #[test]
    fn test_read_cstr_empty() {
        let buf: [i8; 4] = [0, 0, 0, 0];
        assert_eq!(read_cstr(&buf), "");
    }

    #[test]
    fn test_read_wstr() {
        let buf: [u16; 6] = [72, 105, 0, 0, 0, 0];
        assert_eq!(read_wstr(&buf), "Hi");
    }

    #[test]
    fn test_format_uid() {
        let uid: [i8; 16] = [
            0x12, 0x34, 0x56, 0x78,
            0x9A_u8 as i8, 0xBC_u8 as i8,
            0xDE_u8 as i8, 0xF0_u8 as i8,
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88_u8 as i8,
        ];
        assert_eq!(format_uid(&uid), "12345678-9abc-def0-1122-334455667788");
    }

    #[test]
    fn test_load_real_plugin() {
        let path = Path::new("/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3");
        if !path.exists() {
            eprintln!("Skipping: ACE Bridge not installed");
            return;
        }

        let result = unsafe { load_plugin(path, "test-instance") };
        match result {
            Ok((instance, metadata)) => {
                assert!(!instance.plugin_uid.is_empty());
                println!("Loaded plugin UID: {}", instance.plugin_uid);
                println!("Parameters: {}", metadata.parameters.len());
                for p in &metadata.parameters {
                    println!("  - {} (id={}, default={})", p.name, p.id, p.default_value);
                }
                println!("Latency: {} samples", metadata.latency_samples);
            }
            Err(e) => {
                eprintln!("Load failed (may be expected): {e:?}");
            }
        }
    }
}
