//! Scans the filesystem for VST3 plugin bundles.
//!
//! A `.vst3` bundle is a directory whose name ends in `.vst3`. We look in the
//! standard macOS locations:
//!
//! - `/Library/Audio/Plug-Ins/VST3/`
//! - `~/Library/Audio/Plug-Ins/VST3/`
//!
//! Without the real VST3 SDK we derive plugin metadata from the bundle filename.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tracing::info;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::protocol::PluginInfo;

/// In-memory cache of scan results.
pub struct PluginScanner {
    cache: Mutex<Option<Vec<PluginInfo>>>,
}

impl PluginScanner {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }

    /// Return the default VST3 search directories for macOS.
    pub fn default_search_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![PathBuf::from("/Library/Audio/Plug-Ins/VST3")];
        if let Some(home) = dirs::home_dir_raw() {
            dirs.push(home.join("Library/Audio/Plug-Ins/VST3"));
        }
        dirs
    }

    /// Scan the given directories for `.vst3` bundles.
    ///
    /// Results are cached; subsequent calls return the cached list. Call
    /// [`clear_cache`] to force a re-scan.
    pub fn scan(&self, search_dirs: &[PathBuf]) -> Vec<PluginInfo> {
        {
            let guard = self.cache.lock().unwrap();
            if let Some(ref cached) = *guard {
                return cached.clone();
            }
        }

        let plugins = scan_directories(search_dirs);
        let mut guard = self.cache.lock().unwrap();
        *guard = Some(plugins.clone());
        plugins
    }

    /// Clear the cached scan results so the next [`scan`] re-reads the filesystem.
    pub fn clear_cache(&self) {
        let mut guard = self.cache.lock().unwrap();
        *guard = None;
    }
}

/// Walk `search_dirs` and collect every `.vst3` bundle found at depth 1.
fn scan_directories(search_dirs: &[PathBuf]) -> Vec<PluginInfo> {
    let mut plugins = Vec::new();

    for dir in search_dirs {
        if !dir.exists() {
            info!("Skipping non-existent directory: {}", dir.display());
            continue;
        }

        // Only walk one level deep — VST3 bundles sit directly inside the
        // search directory (they are themselves directories with a `.vst3`
        // extension).
        for entry in WalkDir::new(dir).min_depth(1).max_depth(1) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if is_vst3_bundle(entry.path()) {
                if let Some(info) = plugin_info_from_path(entry.path()) {
                    info!("Found VST3 plugin: {} at {}", info.name, info.path);
                    plugins.push(info);
                }
            }
        }
    }

    plugins
}

/// Check whether a path looks like a `.vst3` bundle (a directory ending in `.vst3`).
fn is_vst3_bundle(path: &Path) -> bool {
    path.is_dir()
        && path
            .extension()
            .map_or(false, |ext| ext.eq_ignore_ascii_case("vst3"))
}

/// Derive stub [`PluginInfo`] from a `.vst3` bundle path.
///
/// The real implementation will use the VST3 SDK to query the plugin. For now
/// we just extract the name from the filename.
fn plugin_info_from_path(path: &Path) -> Option<PluginInfo> {
    let stem = path.file_stem()?.to_string_lossy().to_string();
    Some(PluginInfo {
        uid: Uuid::new_v4().to_string(),
        name: stem,
        vendor: "Unknown".into(),
        version: "0.0.0".into(),
        category: "Unknown".into(),
        path: path.to_string_lossy().to_string(),
    })
}

/// Tiny helper so we don't pull in the `dirs` crate just for home directory.
mod dirs {
    use std::path::PathBuf;

    pub fn home_dir_raw() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_vst3_bundle(parent: &Path, name: &str) {
        let bundle = parent.join(format!("{name}.vst3"));
        fs::create_dir_all(&bundle).unwrap();
    }

    #[test]
    fn test_scan_finds_vst3_bundles() {
        let tmp = TempDir::new().unwrap();
        make_vst3_bundle(tmp.path(), "Synth1");
        make_vst3_bundle(tmp.path(), "Compressor");

        // Also create a non-vst3 directory and a regular file — should be ignored.
        fs::create_dir_all(tmp.path().join("NotAPlugin")).unwrap();
        fs::write(tmp.path().join("readme.txt"), "hello").unwrap();

        let scanner = PluginScanner::new();
        let plugins = scanner.scan(&[tmp.path().to_path_buf()]);

        assert_eq!(plugins.len(), 2);
        let names: Vec<&str> = plugins.iter().map(|p| p.name.as_str()).collect();
        assert!(names.contains(&"Synth1"));
        assert!(names.contains(&"Compressor"));
    }

    #[test]
    fn test_scan_caches_results() {
        let tmp = TempDir::new().unwrap();
        make_vst3_bundle(tmp.path(), "CachedPlugin");

        let scanner = PluginScanner::new();
        let first = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(first.len(), 1);

        // Add another bundle — should not appear because results are cached.
        make_vst3_bundle(tmp.path(), "NewPlugin");
        let second = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(second.len(), 1);

        // After clearing the cache, the new plugin should appear.
        scanner.clear_cache();
        let third = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(third.len(), 2);
    }

    #[test]
    fn test_scan_skips_nonexistent_dirs() {
        let scanner = PluginScanner::new();
        let plugins = scanner.scan(&[PathBuf::from("/tmp/definitely_does_not_exist_12345")]);
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_is_vst3_bundle() {
        let tmp = TempDir::new().unwrap();

        let bundle = tmp.path().join("Test.vst3");
        fs::create_dir_all(&bundle).unwrap();
        assert!(is_vst3_bundle(&bundle));

        let not_bundle = tmp.path().join("Test.txt");
        fs::write(&not_bundle, "hi").unwrap();
        assert!(!is_vst3_bundle(&not_bundle));

        let not_ext = tmp.path().join("Test.dll");
        fs::create_dir_all(&not_ext).unwrap();
        assert!(!is_vst3_bundle(&not_ext));
    }

    #[test]
    fn test_plugin_info_from_path() {
        let tmp = TempDir::new().unwrap();
        let bundle = tmp.path().join("MySynth.vst3");
        fs::create_dir_all(&bundle).unwrap();

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.name, "MySynth");
        assert_eq!(info.vendor, "Unknown");
        assert!(!info.uid.is_empty());
        assert!(info.path.contains("MySynth.vst3"));
    }
}
