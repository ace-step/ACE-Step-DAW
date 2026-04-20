//! Tauri IPC commands exposing the `ace-plugin-host` scanner and
//! instance registry to the webview.
//!
//! Two independent managed states:
//! - `PluginScannerState` (Phase 4A-2) owns the scan-result cache
//! - `PluginHostState`    (Phase 4A-3) owns the live VST3 instances
//!
//! They're deliberately separate so scanning can't block on plugin
//! loading and vice versa.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use ace_plugin_host::{
    InstanceInfo, PluginHost, PluginHostError, PluginInfo, PluginScanner, ScanProgress,
};

/// Event name emitted once per discovered bundle during `plugin_rescan`.
/// Matches the camelCase convention of every other cross-process event.
pub const PLUGIN_SCAN_PROGRESS_EVENT: &str = "plugin-scan-progress";

/// Managed-state wrapper around the process-wide scanner.
///
/// `PluginScanner` owns its own `Mutex` around the cache, so we only
/// need `Arc` here — no outer mutex. Cloning `Arc` is cheap and the
/// scanner's public API is internally synchronised.
pub struct PluginScannerState(pub Arc<PluginScanner>);

impl PluginScannerState {
    pub fn new() -> Self {
        Self(Arc::new(PluginScanner::new()))
    }
}

impl Default for PluginScannerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Thin error shape — scanner operations are infallible from the
/// caller's perspective today, but keeping a result type in the wire
/// signature means 4A-3 can extend it without breaking clients.
#[derive(Debug, Serialize)]
pub struct PluginCommandError {
    pub message: String,
}

impl std::fmt::Display for PluginCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for PluginCommandError {}

impl From<PluginHostError> for PluginCommandError {
    fn from(e: PluginHostError) -> Self {
        Self {
            message: e.to_string(),
        }
    }
}

/// Managed-state wrapper around the process-wide instance registry.
/// Like the scanner, the host owns its own synchronisation so the
/// wrapper only needs an `Arc`.
pub struct PluginHostState(pub Arc<PluginHost>);

impl PluginHostState {
    pub fn new() -> Self {
        Self(Arc::new(PluginHost::new()))
    }
}

impl Default for PluginHostState {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve the list of directories to scan. Empty / None → platform
/// defaults (currently macOS-only, extended in a later subphase).
fn resolve_search_dirs(paths: Option<Vec<String>>) -> Vec<PathBuf> {
    match paths {
        Some(p) if !p.is_empty() => p.into_iter().map(PathBuf::from).collect(),
        _ => PluginScanner::default_search_dirs(),
    }
}

/// Return the current scan result, triggering a fresh scan only if the
/// cache is cold. Callers that want to force a re-scan should use
/// [`plugin_rescan`] instead.
#[tauri::command]
pub fn plugin_scan(
    paths: Option<Vec<String>>,
    state: State<'_, PluginScannerState>,
) -> Result<Vec<PluginInfo>, PluginCommandError> {
    let dirs = resolve_search_dirs(paths);
    Ok(state.0.scan(&dirs))
}

/// Return the cached scan result without touching the filesystem.
/// Returns an empty vec when the cache is cold — callers can use that
/// as a signal to invoke `plugin_scan` or `plugin_rescan`.
#[tauri::command]
pub fn plugin_list_cached(
    state: State<'_, PluginScannerState>,
) -> Result<Vec<PluginInfo>, PluginCommandError> {
    // `PluginScanner` has no public `cached()` accessor — calling
    // `scan()` with the default dirs would re-scan if the cache is
    // empty, which we explicitly do not want here. Instead we scan a
    // zero-dir list so any cached result comes back unchanged, and a
    // cold cache simply yields an empty vec without touching the fs.
    Ok(state.0.scan(&[]))
}

/// Force a re-scan, clearing the cache first. Each discovered bundle
/// triggers a `plugin-scan-progress` event so the UI can render
/// `N of M — Plugin X` progress without buffering intermediate state.
#[tauri::command]
pub fn plugin_rescan(
    paths: Option<Vec<String>>,
    state: State<'_, PluginScannerState>,
    app: AppHandle,
) -> Result<Vec<PluginInfo>, PluginCommandError> {
    let dirs = resolve_search_dirs(paths);
    state.0.clear_cache();

    let scanner = Arc::clone(&state.0);
    let callback_app = app.clone();
    let callback = move |progress: ScanProgress| {
        // Best-effort emit — webview may be unresponsive during a
        // rescan in edge cases; a dropped tick is preferable to
        // panicking the scanner thread.
        let _ = callback_app.emit(PLUGIN_SCAN_PROGRESS_EVENT, progress);
    };

    Ok(scanner.scan_with_progress(&dirs, Some(&callback)))
}

// ---------------------------------------------------------------------------
// 4A-3: plugin instantiation
// ---------------------------------------------------------------------------

/// Load a `.vst3` bundle and register the resulting instance. The
/// returned `InstanceInfo` is the frontend's entire view of the
/// plugin — the actual COM handles stay in `PluginHostState` and
/// are addressed by `instance_id`.
#[tauri::command]
pub fn plugin_instantiate(
    bundle_path: String,
    state: State<'_, PluginHostState>,
) -> Result<InstanceInfo, PluginCommandError> {
    // SAFETY: `load_plugin` is unsafe because it dlopens native code;
    // the Tauri boundary is the trust boundary. `bundle_path` is
    // supplied by the frontend, which should only source it from
    // previous scan results — we do not validate further here because
    // the user may legitimately drag a bundle from an arbitrary path.
    let info = unsafe { state.0.instantiate(Path::new(&bundle_path)) }?;
    Ok(info)
}

/// Release the instance identified by `instance_id`. Dropping the
/// last reference unloads the plugin's dylib.
#[tauri::command]
pub fn plugin_release(
    instance_id: String,
    state: State<'_, PluginHostState>,
) -> Result<(), PluginCommandError> {
    state.0.release(&instance_id)?;
    Ok(())
}

/// Snapshot of every live plugin instance. Order is unspecified —
/// stable sort on the frontend if needed.
#[tauri::command]
pub fn plugin_list_instances(
    state: State<'_, PluginHostState>,
) -> Result<Vec<InstanceInfo>, PluginCommandError> {
    Ok(state.0.list()?)
}

#[cfg(test)]
mod tests {
    //! Scanner-state tests that exercise behaviour visible through the
    //! `PluginScannerState` wrapper without instantiating Tauri. The
    //! commands themselves are thin enough that the underlying scanner
    //! tests (in `ace-plugin-host`) already cover the real logic — what
    //! we validate here is the cache-wiring contract.

    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_bundle(parent: &std::path::Path, name: &str) {
        fs::create_dir_all(parent.join(format!("{name}.vst3"))).unwrap();
    }

    #[test]
    fn state_is_process_wide_cache_across_calls() {
        let tmp = TempDir::new().unwrap();
        make_bundle(tmp.path(), "Alpha");

        let state = PluginScannerState::new();
        let first = state.0.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(first.len(), 1);

        // Second call on the same Arc returns cached data — proving
        // that the managed-state Arc is the cache owner.
        make_bundle(tmp.path(), "Beta");
        let second = state.0.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(second.len(), 1, "cache masks the new bundle");

        state.0.clear_cache();
        let third = state.0.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(third.len(), 2, "rescan picks up the new bundle");
    }

    #[test]
    fn resolve_search_dirs_uses_default_when_none_or_empty() {
        // Snapshot the default list so we can verify the helper returns
        // the same value regardless of whether the caller passes None
        // or an empty vec.
        let defaults = PluginScanner::default_search_dirs();
        assert_eq!(resolve_search_dirs(None), defaults);
        assert_eq!(resolve_search_dirs(Some(vec![])), defaults);
    }

    #[test]
    fn resolve_search_dirs_honours_caller_supplied_paths() {
        let dirs = resolve_search_dirs(Some(vec!["/custom/one".into(), "/custom/two".into()]));
        assert_eq!(dirs.len(), 2);
        assert_eq!(dirs[0], PathBuf::from("/custom/one"));
        assert_eq!(dirs[1], PathBuf::from("/custom/two"));
    }

    #[test]
    fn list_cached_returns_empty_vec_when_cache_is_cold() {
        // Scanning a zero-dir slice must not panic and must not
        // re-scan the default dirs; it should simply yield what the
        // cache already contains.
        let state = PluginScannerState::new();
        let cached = state.0.scan(&[]);
        assert!(cached.is_empty(), "cold cache must not implicitly re-scan");
    }

    #[test]
    fn list_cached_returns_last_scan_result_after_warm_up() {
        let tmp = TempDir::new().unwrap();
        make_bundle(tmp.path(), "Warm");

        let state = PluginScannerState::new();
        let fresh = state.0.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(fresh.len(), 1);

        // list_cached's zero-dir scan should surface the warmed cache.
        let cached = state.0.scan(&[]);
        assert_eq!(cached, fresh);
    }

    // ── PluginHostState (4A-3) ───────────────────────────────────────

    #[test]
    fn host_state_list_instances_is_empty_on_fresh_state() {
        let state = PluginHostState::new();
        let instances = state.0.list().expect("list must succeed on fresh state");
        assert!(instances.is_empty());
    }

    #[test]
    fn host_state_release_unknown_instance_errors() {
        let state = PluginHostState::new();
        let err = state.0.release("no-such-instance").unwrap_err();
        assert!(
            matches!(err, PluginHostError::UnknownInstance(ref id) if id == "no-such-instance"),
            "expected UnknownInstance, got {err:?}"
        );
    }

    #[test]
    fn plugin_command_error_converts_from_host_error_with_message() {
        let host_err = PluginHostError::UnknownInstance("abc".into());
        let cmd_err: PluginCommandError = host_err.into();
        // Confirm the display message round-trips so the UI can show
        // something sensible in an error toast.
        assert!(cmd_err.message.contains("abc"));
    }
}
