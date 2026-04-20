//! Tauri IPC commands exposing the `ace-plugin-host` scanner to the
//! webview. The scanner itself is stateful (owns an in-memory cache),
//! so a single `Arc<PluginScanner>` is shared via managed state.
//!
//! Phase 4A-2 scope — scanning only. Plugin instantiation lives in a
//! later subphase.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use ace_plugin_host::{PluginInfo, PluginScanner, ScanProgress};

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
}
