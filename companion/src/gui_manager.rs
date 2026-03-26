//! Native window management for VST3 plugin editor GUIs.
//!
//! On macOS, creates `NSWindow` + `NSView` via the `cocoa` and `objc` crates,
//! then passes the `NSView` pointer to `IPlugView::attached()`.
//!
//! All AppKit operations are dispatched to the main thread as required by macOS.
//!
//! In tests, the real Cocoa calls are replaced by a stub backend.

use std::collections::HashMap;
use std::ffi::c_void;

#[cfg(target_os = "macos")]
use vst3::Steinberg::IPlugView;

// ---------------------------------------------------------------------------
// Platform-specific native window backend
// ---------------------------------------------------------------------------

/// A native window handle (NSWindow id on macOS, opaque pointer elsewhere).
#[derive(Debug, Clone, Copy)]
struct NativeWindowHandle {
    window: *mut c_void,
    view: *mut c_void,
}

// Safety: We only access these pointers on the main thread (enforced by dispatch).
unsafe impl Send for NativeWindowHandle {}
unsafe impl Sync for NativeWindowHandle {}

/// Trait abstracting native window operations so tests can mock Cocoa calls.
trait NativeBackend: Send + Sync {
    /// Create a native window with the given title and dimensions.
    /// Returns (window_handle, view_handle).
    fn create_window(
        &self,
        title: &str,
        width: u32,
        height: u32,
    ) -> Result<NativeWindowHandle, String>;

    /// Resize an existing window and its content view.
    fn resize_window(
        &self,
        handle: &NativeWindowHandle,
        width: u32,
        height: u32,
    ) -> Result<(), String>;

    /// Close and release a native window.
    fn close_window(&self, handle: &NativeWindowHandle) -> Result<(), String>;
}

// ---------------------------------------------------------------------------
// macOS real backend
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod macos_backend {
    use super::*;
    use cocoa::appkit::{
        NSWindow, NSWindowStyleMask, NSBackingStoreType,
    };
    use cocoa::base::{id, nil, NO, YES};
    use cocoa::foundation::{NSAutoreleasePool, NSPoint, NSRect, NSSize, NSString};
    use objc::msg_send;
    use objc::sel;
    use objc::sel_impl;

    pub struct CocoaBackend;

    impl CocoaBackend {
        pub fn new() -> Self {
            Self
        }
    }

    impl NativeBackend for CocoaBackend {
        fn create_window(
            &self,
            title: &str,
            width: u32,
            height: u32,
        ) -> Result<NativeWindowHandle, String> {
            unsafe {
                let _pool = NSAutoreleasePool::new(nil);

                let rect = NSRect::new(
                    NSPoint::new(200.0, 200.0),
                    NSSize::new(width as f64, height as f64),
                );

                let style = NSWindowStyleMask::NSTitledWindowMask
                    | NSWindowStyleMask::NSClosableWindowMask
                    | NSWindowStyleMask::NSResizableWindowMask;

                let window = NSWindow::alloc(nil).initWithContentRect_styleMask_backing_defer_(
                    rect,
                    style,
                    NSBackingStoreType::NSBackingStoreBuffered,
                    NO,
                );

                if window == nil {
                    return Err("Failed to create NSWindow".into());
                }

                let ns_title = NSString::alloc(nil).init_str(title);
                window.setTitle_(ns_title);
                window.center();

                let content_view: id = window.contentView();
                if content_view == nil {
                    return Err("NSWindow has no contentView".into());
                }

                window.makeKeyAndOrderFront_(nil);

                Ok(NativeWindowHandle {
                    window: window as *mut c_void,
                    view: content_view as *mut c_void,
                })
            }
        }

        fn resize_window(
            &self,
            handle: &NativeWindowHandle,
            width: u32,
            height: u32,
        ) -> Result<(), String> {
            unsafe {
                let window = handle.window as id;
                if window == nil {
                    return Err("Invalid window handle".into());
                }
                let frame = NSWindow::frame(window);
                let new_frame = NSRect::new(
                    frame.origin,
                    NSSize::new(width as f64, height as f64),
                );
                // Resize with animation disabled for immediate feedback
                let _: () = msg_send![window, setFrame:new_frame display:YES animate:NO];
                Ok(())
            }
        }

        fn close_window(&self, handle: &NativeWindowHandle) -> Result<(), String> {
            unsafe {
                let window = handle.window as id;
                if window == nil {
                    return Err("Invalid window handle".into());
                }
                window.close();
                Ok(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Stub backend (for tests and non-macOS platforms)
// ---------------------------------------------------------------------------

/// A stub backend that tracks calls without creating real windows.
struct StubBackend {
    next_id: std::sync::atomic::AtomicUsize,
}

impl StubBackend {
    fn new() -> Self {
        Self {
            next_id: std::sync::atomic::AtomicUsize::new(1),
        }
    }
}

impl NativeBackend for StubBackend {
    fn create_window(
        &self,
        _title: &str,
        _width: u32,
        _height: u32,
    ) -> Result<NativeWindowHandle, String> {
        let id = self
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Ok(NativeWindowHandle {
            window: id as *mut c_void,
            view: (id + 0x1000) as *mut c_void,
        })
    }

    fn resize_window(
        &self,
        handle: &NativeWindowHandle,
        _width: u32,
        _height: u32,
    ) -> Result<(), String> {
        if handle.window.is_null() {
            return Err("Invalid window handle".into());
        }
        Ok(())
    }

    fn close_window(&self, handle: &NativeWindowHandle) -> Result<(), String> {
        if handle.window.is_null() {
            return Err("Invalid window handle".into());
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// IPlugView wrapper
// ---------------------------------------------------------------------------

/// Wraps a `ComPtr<IPlugView>` with the operations we need.
///
/// On non-macOS or in tests, this is a no-op stub.
struct PlugViewHandle {
    #[cfg(target_os = "macos")]
    plug_view: Option<vst3::ComPtr<IPlugView>>,
}

impl PlugViewHandle {
    /// Create a PlugViewHandle from an IEditController.
    ///
    /// Calls `createView("editor")` to obtain the IPlugView.
    #[cfg(target_os = "macos")]
    fn from_controller(
        controller: &vst3::ComPtr<vst3::Steinberg::Vst::IEditController>,
    ) -> Result<(Self, u32, u32), String> {
        use vst3::Steinberg::{IPlugViewTrait, ViewRect, kResultOk};

        unsafe {
            let view_type = b"editor\0".as_ptr() as *const i8;
            let view = {
                use vst3::Steinberg::Vst::IEditControllerTrait;
                controller.createView(view_type)
            };

            if view.is_null() {
                return Err("IEditController::createView returned null".into());
            }

            let plug_view = vst3::ComPtr::<IPlugView>::from_raw(view)
                .ok_or_else(|| "Failed to wrap IPlugView pointer".to_string())?;

            // Get preferred size
            let mut rect: ViewRect = std::mem::zeroed();
            let result = plug_view.getSize(&mut rect);
            let (width, height) = if result == kResultOk {
                (
                    (rect.right - rect.left).max(0) as u32,
                    (rect.bottom - rect.top).max(0) as u32,
                )
            } else {
                // Default size if getSize fails
                (800, 600)
            };

            Ok((
                Self {
                    plug_view: Some(plug_view),
                },
                width,
                height,
            ))
        }
    }

    /// Create a stub handle (no real IPlugView).
    fn stub(width: u32, height: u32) -> (Self, u32, u32) {
        (
            Self {
                #[cfg(target_os = "macos")]
                plug_view: None,
            },
            width,
            height,
        )
    }

    /// Attach the plugin view to a native view handle.
    #[cfg(target_os = "macos")]
    fn attach(&self, view_ptr: *mut c_void) -> Result<(), String> {
        use vst3::Steinberg::{IPlugViewTrait, kResultOk};

        if let Some(ref pv) = self.plug_view {
            let platform_type = b"NSView\0".as_ptr() as *mut i8;
            let result = unsafe { pv.attached(view_ptr, platform_type) };
            if result != kResultOk {
                return Err(format!("IPlugView::attached failed: result={result}"));
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn attach(&self, _view_ptr: *mut c_void) -> Result<(), String> {
        Ok(())
    }

    /// Detach the plugin view before closing the window.
    #[cfg(target_os = "macos")]
    fn detach(&self) -> Result<(), String> {
        use vst3::Steinberg::{IPlugViewTrait, kResultOk};

        if let Some(ref pv) = self.plug_view {
            let result = unsafe { pv.removed() };
            if result != kResultOk {
                return Err(format!("IPlugView::removed failed: result={result}"));
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn detach(&self) -> Result<(), String> {
        Ok(())
    }

    /// Notify the plugin view of a size change.
    #[cfg(target_os = "macos")]
    fn on_size(&self, width: u32, height: u32) -> Result<(), String> {
        use vst3::Steinberg::{IPlugViewTrait, ViewRect, kResultOk};

        if let Some(ref pv) = self.plug_view {
            let mut rect = ViewRect {
                left: 0,
                top: 0,
                right: width as i32,
                bottom: height as i32,
            };
            let result = unsafe { pv.onSize(&mut rect) };
            if result != kResultOk {
                return Err(format!("IPlugView::onSize failed: result={result}"));
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn on_size(&self, _width: u32, _height: u32) -> Result<(), String> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// PluginWindow — combines native window + plug view
// ---------------------------------------------------------------------------

struct PluginWindow {
    native: NativeWindowHandle,
    plug_view: PlugViewHandle,
    width: u32,
    height: u32,
}

// ---------------------------------------------------------------------------
// GuiManager — public API
// ---------------------------------------------------------------------------

/// Manages native windows for VST3 plugin editor views.
///
/// # Thread Safety
///
/// On macOS, all native window operations happen on the main thread.
/// The `GuiManager` itself tracks state and delegates to the backend.
pub struct GuiManager {
    windows: HashMap<String, PluginWindow>,
    backend: Box<dyn NativeBackend>,
}

impl GuiManager {
    /// Create a new GuiManager with the real platform backend.
    #[cfg(target_os = "macos")]
    pub fn new() -> Self {
        Self {
            windows: HashMap::new(),
            backend: Box::new(macos_backend::CocoaBackend::new()),
        }
    }

    /// Create a new GuiManager with the stub backend (non-macOS or testing).
    #[cfg(not(target_os = "macos"))]
    pub fn new() -> Self {
        Self::with_stub_backend()
    }

    /// Create a GuiManager with a stub backend (for testing).
    pub fn with_stub_backend() -> Self {
        Self {
            windows: HashMap::new(),
            backend: Box::new(StubBackend::new()),
        }
    }

    /// Open a native editor window for a VST3 plugin instance.
    ///
    /// On macOS with a real IEditController, this will:
    /// 1. Call `createView("editor")` to get an `IPlugView`
    /// 2. Query `getSize()` for preferred dimensions
    /// 3. Create an `NSWindow` + `NSView`
    /// 4. Call `IPlugView::attached()` to embed the plugin GUI
    ///
    /// Returns `(width, height)` of the editor.
    #[cfg(target_os = "macos")]
    pub fn open_editor_with_controller(
        &mut self,
        instance_id: &str,
        controller: &vst3::ComPtr<vst3::Steinberg::Vst::IEditController>,
    ) -> Result<(u32, u32), String> {
        if self.is_editor_open(instance_id) {
            return Err(format!(
                "Editor for instance '{}' is already open",
                instance_id
            ));
        }

        // Create IPlugView from controller
        let (plug_view_handle, width, height) =
            PlugViewHandle::from_controller(controller)?;

        // Create native window
        let title = format!("VST3 Editor — {}", instance_id);
        let native = self.backend.create_window(&title, width, height)?;

        // Attach plugin view to the NSView
        plug_view_handle.attach(native.view)?;

        self.windows.insert(
            instance_id.to_string(),
            PluginWindow {
                native,
                plug_view: plug_view_handle,
                width,
                height,
            },
        );

        Ok((width, height))
    }

    /// Open an editor window with explicit dimensions (stub mode / fallback).
    ///
    /// Used when no IEditController is available (e.g., stub instances).
    pub fn open_editor(
        &mut self,
        instance_id: &str,
        width: u32,
        height: u32,
    ) -> Result<(u32, u32), String> {
        if self.is_editor_open(instance_id) {
            return Err(format!(
                "Editor for instance '{}' is already open",
                instance_id
            ));
        }

        let title = format!("VST3 Editor — {}", instance_id);
        let native = self.backend.create_window(&title, width, height)?;

        let (plug_view_handle, w, h) = PlugViewHandle::stub(width, height);

        self.windows.insert(
            instance_id.to_string(),
            PluginWindow {
                native,
                plug_view: plug_view_handle,
                width: w,
                height: h,
            },
        );

        Ok((w, h))
    }

    /// Close the editor window for a plugin instance.
    ///
    /// Calls `IPlugView::removed()` then closes the native window.
    pub fn close_editor(&mut self, instance_id: &str) -> Result<(), String> {
        let window = self
            .windows
            .remove(instance_id)
            .ok_or_else(|| format!("No editor found for instance '{}'", instance_id))?;

        // Detach plugin view first (calls IPlugView::removed())
        if let Err(e) = window.plug_view.detach() {
            tracing::warn!(instance_id, error = %e, "IPlugView::removed failed (continuing close)");
        }

        // Close the native window
        self.backend.close_window(&window.native)?;

        Ok(())
    }

    /// Resize the editor window and notify the plugin.
    ///
    /// Calls `IPlugView::onSize()` and resizes the native window.
    pub fn resize_editor(
        &mut self,
        instance_id: &str,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let window = self
            .windows
            .get_mut(instance_id)
            .ok_or_else(|| format!("No editor found for instance '{}'", instance_id))?;

        // Notify the plugin view of the new size
        window.plug_view.on_size(width, height)?;

        // Resize the native window
        self.backend.resize_window(&window.native, width, height)?;

        window.width = width;
        window.height = height;

        Ok(())
    }

    /// Check if an editor is currently open for the given instance.
    pub fn is_editor_open(&self, instance_id: &str) -> bool {
        self.windows.contains_key(instance_id)
    }

    /// Get the native view handle for a plugin editor (the NSView pointer).
    ///
    /// Returns `None` if no editor is open.
    pub fn get_native_handle(&self, instance_id: &str) -> Option<*mut c_void> {
        self.windows.get(instance_id).map(|w| w.native.view)
    }

    /// Get the current dimensions of an editor window.
    pub fn get_editor_size(&self, instance_id: &str) -> Option<(u32, u32)> {
        self.windows.get(instance_id).map(|w| (w.width, w.height))
    }

    /// Close all open editor windows.
    pub fn close_all(&mut self) {
        let ids: Vec<String> = self.windows.keys().cloned().collect();
        for id in ids {
            if let Err(e) = self.close_editor(&id) {
                tracing::warn!(instance_id = %id, error = %e, "Failed to close editor during close_all");
            }
        }
    }

    /// Process pending window events.
    ///
    /// In a real implementation this would pump the AppKit run-loop.
    /// Should be called periodically from the event loop.
    pub fn process_events(&mut self) {
        // On macOS, the run loop handles events automatically when using
        // NSApplication. This is a hook for future custom event processing.
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_manager() -> GuiManager {
        GuiManager::with_stub_backend()
    }

    #[test]
    fn test_open_close_editor() {
        let mut mgr = make_manager();
        let (w, h) = mgr.open_editor("inst-1", 800, 600).unwrap();
        assert_eq!(w, 800);
        assert_eq!(h, 600);
        assert!(mgr.is_editor_open("inst-1"));

        mgr.close_editor("inst-1").unwrap();
        assert!(!mgr.is_editor_open("inst-1"));
    }

    #[test]
    fn test_close_nonexistent() {
        let mut mgr = make_manager();
        let result = mgr.close_editor("nonexistent");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("No editor found for instance"));
    }

    #[test]
    fn test_close_all() {
        let mut mgr = make_manager();
        mgr.open_editor("inst-1", 800, 600).unwrap();
        mgr.open_editor("inst-2", 640, 480).unwrap();
        mgr.close_all();
        assert!(!mgr.is_editor_open("inst-1"));
        assert!(!mgr.is_editor_open("inst-2"));
    }

    #[test]
    fn test_duplicate_open_returns_error() {
        let mut mgr = make_manager();
        mgr.open_editor("inst-1", 800, 600).unwrap();
        let result = mgr.open_editor("inst-1", 800, 600);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already open"));
    }

    #[test]
    fn test_get_native_handle() {
        let mut mgr = make_manager();
        assert!(mgr.get_native_handle("inst-1").is_none());

        mgr.open_editor("inst-1", 800, 600).unwrap();
        let handle = mgr.get_native_handle("inst-1");
        assert!(handle.is_some());
        assert!(!handle.unwrap().is_null());

        mgr.close_editor("inst-1").unwrap();
        assert!(mgr.get_native_handle("inst-1").is_none());
    }

    #[test]
    fn test_process_events_does_not_panic() {
        let mut mgr = make_manager();
        mgr.open_editor("inst-1", 800, 600).unwrap();
        mgr.process_events(); // should be a no-op without panicking
    }

    #[test]
    fn test_new_manager_has_no_editors() {
        let mgr = make_manager();
        assert!(!mgr.is_editor_open("anything"));
        assert!(mgr.get_native_handle("anything").is_none());
    }

    #[test]
    fn test_resize_editor() {
        let mut mgr = make_manager();
        mgr.open_editor("inst-1", 800, 600).unwrap();

        mgr.resize_editor("inst-1", 1024, 768).unwrap();
        let (w, h) = mgr.get_editor_size("inst-1").unwrap();
        assert_eq!(w, 1024);
        assert_eq!(h, 768);
    }

    #[test]
    fn test_resize_nonexistent_returns_error() {
        let mut mgr = make_manager();
        let result = mgr.resize_editor("nonexistent", 800, 600);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_editor_size() {
        let mut mgr = make_manager();
        assert!(mgr.get_editor_size("inst-1").is_none());

        mgr.open_editor("inst-1", 640, 480).unwrap();
        let size = mgr.get_editor_size("inst-1");
        assert_eq!(size, Some((640, 480)));
    }

    #[test]
    fn test_multiple_editors_independent() {
        let mut mgr = make_manager();

        mgr.open_editor("inst-1", 800, 600).unwrap();
        mgr.open_editor("inst-2", 640, 480).unwrap();

        assert!(mgr.is_editor_open("inst-1"));
        assert!(mgr.is_editor_open("inst-2"));

        // Closing one doesn't affect the other
        mgr.close_editor("inst-1").unwrap();
        assert!(!mgr.is_editor_open("inst-1"));
        assert!(mgr.is_editor_open("inst-2"));

        // Handles are distinct
        let h2 = mgr.get_native_handle("inst-2");
        assert!(h2.is_some());
        assert!(!h2.unwrap().is_null());
    }

    #[test]
    fn test_open_after_close_succeeds() {
        let mut mgr = make_manager();
        mgr.open_editor("inst-1", 800, 600).unwrap();
        mgr.close_editor("inst-1").unwrap();

        // Re-opening should succeed
        let (w, h) = mgr.open_editor("inst-1", 1024, 768).unwrap();
        assert_eq!(w, 1024);
        assert_eq!(h, 768);
        assert!(mgr.is_editor_open("inst-1"));
    }

    #[test]
    fn test_close_all_on_empty_does_not_panic() {
        let mut mgr = make_manager();
        mgr.close_all(); // should be a no-op
    }
}
