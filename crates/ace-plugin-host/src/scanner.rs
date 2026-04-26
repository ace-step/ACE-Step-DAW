//! Scans the filesystem for VST3 plugin bundles.
//!
//! A `.vst3` bundle is a directory whose name ends in `.vst3`. The
//! standard macOS search locations are:
//!
//! - `/Library/Audio/Plug-Ins/VST3/`
//! - `~/Library/Audio/Plug-Ins/VST3/`
//!
//! Metadata is extracted from the bundle's `Info.plist` and optional
//! `moduleinfo.json` files. Falls back to the bundle filename when
//! metadata is unavailable.
//!
//! # Progress reporting
//!
//! `scan_with_progress` does a two-pass walk: first counts the bundles
//! so the UI can show an accurate total, then parses metadata and
//! emits one progress tick per bundle. `scan` (no callback) is the
//! single-pass fast path.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tracing::info;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::types::{PluginInfo, ScanProgress};

/// Callback fired once per plugin while a scan is in progress.
pub type ScanProgressCallback<'a> = &'a (dyn Fn(ScanProgress) + Send + Sync);

/// In-memory cache of scan results. Cheap to construct; stateless from
/// the caller's perspective — the cache is private.
pub struct PluginScanner {
    cache: Mutex<Option<Vec<PluginInfo>>>,
}

impl PluginScanner {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }

    /// Default VST3 search directories for macOS. Adjust the list for
    /// other platforms in a later subphase — keeping macOS-only here
    /// matches the current companion behaviour.
    pub fn default_search_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![PathBuf::from("/Library/Audio/Plug-Ins/VST3")];
        if let Some(home) = home_dir() {
            dirs.push(home.join("Library/Audio/Plug-Ins/VST3"));
        }
        dirs
    }

    /// Scan the given directories for `.vst3` bundles. Results are
    /// cached; subsequent calls return the cached list until
    /// [`clear_cache`] is called.
    pub fn scan(&self, search_dirs: &[PathBuf]) -> Vec<PluginInfo> {
        self.scan_with_progress(search_dirs, None)
    }

    /// Scan with optional progress reporting. When `callback` is
    /// `Some`, a first pass walks the directories to count bundles so
    /// the callback receives an accurate `total` on every tick.
    pub fn scan_with_progress(
        &self,
        search_dirs: &[PathBuf],
        callback: Option<ScanProgressCallback<'_>>,
    ) -> Vec<PluginInfo> {
        {
            let guard = self.cache.lock().unwrap();
            if let Some(ref cached) = *guard {
                return cached.clone();
            }
        }

        let plugins = scan_directories(search_dirs, callback);
        let mut guard = self.cache.lock().unwrap();
        *guard = Some(plugins.clone());
        plugins
    }

    /// Drop the cached scan results so the next [`scan`] re-reads the
    /// filesystem.
    pub fn clear_cache(&self) {
        let mut guard = self.cache.lock().unwrap();
        *guard = None;
    }
}

impl Default for PluginScanner {
    fn default() -> Self {
        Self::new()
    }
}

/// Walk `search_dirs` and collect every `.vst3` bundle found at
/// depth 1. With a callback, pre-count bundles so each tick carries an
/// accurate total.
fn scan_directories(
    search_dirs: &[PathBuf],
    callback: Option<ScanProgressCallback<'_>>,
) -> Vec<PluginInfo> {
    let total: u32 = if callback.is_some() {
        count_bundles(search_dirs) as u32
    } else {
        0
    };

    let mut plugins = Vec::new();
    let mut scanned: u32 = 0;

    for dir in search_dirs {
        if !dir.exists() {
            info!("Skipping non-existent directory: {}", dir.display());
            continue;
        }

        for entry in WalkDir::new(dir).min_depth(1).max_depth(1) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if is_vst3_bundle(entry.path()) {
                if let Some(info) = plugin_info_from_path(entry.path()) {
                    info!("Found VST3 plugin: {} at {}", info.name, info.path);
                    scanned += 1;
                    if let Some(cb) = callback {
                        cb(ScanProgress {
                            scanned,
                            total,
                            current_plugin: info.name.clone(),
                        });
                    }
                    plugins.push(info);
                }
            }
        }
    }

    plugins
}

fn count_bundles(search_dirs: &[PathBuf]) -> usize {
    let mut count = 0usize;
    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }
        for entry in WalkDir::new(dir).min_depth(1).max_depth(1).into_iter().flatten() {
            if is_vst3_bundle(entry.path()) {
                count += 1;
            }
        }
    }
    count
}

/// True if `path` looks like a `.vst3` bundle (a directory whose name
/// ends in `.vst3`, case-insensitive).
fn is_vst3_bundle(path: &Path) -> bool {
    path.is_dir()
        && path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("vst3"))
}

#[derive(Debug, Default)]
struct PlistMetadata {
    version: Option<String>,
    vendor: Option<String>,
}

/// Read and parse `Info.plist` from a VST3 bundle, preferring
/// `Contents/Info.plist` but falling back to the bundle root.
fn read_plist_metadata(bundle_path: &Path) -> PlistMetadata {
    let candidates = [
        bundle_path.join("Contents/Info.plist"),
        bundle_path.join("Info.plist"),
    ];

    let plist_path = match candidates.iter().find(|p| p.is_file()) {
        Some(p) => p,
        None => return PlistMetadata::default(),
    };

    let dict = match plist::Value::from_file(plist_path) {
        Ok(plist::Value::Dictionary(d)) => d,
        _ => return PlistMetadata::default(),
    };

    let version = dict
        .get("CFBundleShortVersionString")
        .or_else(|| dict.get("CFBundleVersion"))
        .and_then(|v| v.as_string())
        .map(|s| s.to_string());

    let vendor = extract_vendor_from_dict(&dict);

    PlistMetadata { version, vendor }
}

fn extract_vendor_from_dict(dict: &plist::Dictionary) -> Option<String> {
    if let Some(id) = dict.get("CFBundleIdentifier").and_then(|v| v.as_string()) {
        if let Some(vendor) = vendor_from_bundle_id(id) {
            return Some(vendor);
        }
    }

    if let Some(copyright) = dict
        .get("NSHumanReadableCopyright")
        .and_then(|v| v.as_string())
    {
        if let Some(vendor) = vendor_from_copyright(copyright) {
            return Some(vendor);
        }
    }

    None
}

/// Extract vendor from a reverse-DNS bundle identifier, e.g.
/// `com.fabfilter.Pro-Q3` → `fabfilter`. Apple-signed shim bundles are
/// filtered out because they never identify the third-party vendor.
fn vendor_from_bundle_id(bundle_id: &str) -> Option<String> {
    let parts: Vec<&str> = bundle_id.split('.').collect();
    if parts.len() >= 3 {
        let vendor = parts[1].to_string();
        if !vendor.is_empty() && vendor.to_lowercase() != "apple" {
            return Some(vendor);
        }
    }
    None
}

/// Extract vendor from a copyright string like
/// `Copyright © 2020-2024 Native Instruments. All rights reserved.`
fn vendor_from_copyright(copyright: &str) -> Option<String> {
    let stripped = copyright
        .trim()
        .trim_start_matches("Copyright")
        .trim()
        .trim_start_matches('©')
        .trim_start_matches("(c)")
        .trim_start_matches("(C)")
        .trim();

    let after_year = skip_year_prefix(stripped);

    let vendor = after_year.trim();
    if vendor.is_empty() {
        return None;
    }

    let vendor = match vendor.to_lowercase().find(". all rights") {
        Some(pos) => &vendor[..pos],
        None => vendor,
    }
    .trim()
    .trim_end_matches('.');

    if vendor.is_empty() {
        None
    } else {
        Some(vendor.to_string())
    }
}

fn skip_year_prefix(s: &str) -> &str {
    let bytes = s.as_bytes();
    if bytes.len() >= 4 && bytes[..4].iter().all(|b| b.is_ascii_digit()) {
        let rest = &s[4..];
        let rest = if let Some(after_dash) = rest.strip_prefix('-') {
            if after_dash.len() >= 4
                && after_dash.as_bytes()[..4].iter().all(|b| b.is_ascii_digit())
            {
                &after_dash[4..]
            } else {
                rest
            }
        } else {
            rest
        };
        rest.trim_start()
    } else {
        s
    }
}

/// Read an optional `Contents/Resources/moduleinfo.json` and extract
/// the first non-empty sub-category from the first class. Format
/// reference: <https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical+Documentation/Plug-in+Format/ModuleInfo.html>
fn read_category_from_moduleinfo(bundle_path: &Path) -> Option<String> {
    let moduleinfo_path = bundle_path.join("Contents/Resources/moduleinfo.json");
    let data = std::fs::read_to_string(&moduleinfo_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&data).ok()?;

    let classes = json.get("Classes")?.as_array()?;
    for class in classes {
        if let Some(subcats) = class.get("Sub Categories").and_then(|v| v.as_array()) {
            for subcat in subcats {
                if let Some(s) = subcat.as_str() {
                    let s = s.trim();
                    if !s.is_empty() {
                        return Some(s.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Build [`PluginInfo`] from a `.vst3` bundle path. Missing metadata
/// falls back to the bundle filename and `"Unknown"`.
fn plugin_info_from_path(path: &Path) -> Option<PluginInfo> {
    let stem = path.file_stem()?.to_string_lossy().to_string();

    let plist_meta = read_plist_metadata(path);
    let category = read_category_from_moduleinfo(path);

    let raw_category = category.unwrap_or_default();
    let (main_cat, sub_cat) = if raw_category.contains('|') {
        let parts: Vec<&str> = raw_category.splitn(2, '|').collect();
        (parts[0].to_string(), parts.get(1).unwrap_or(&"").to_string())
    } else {
        (raw_category.clone(), String::new())
    };

    Some(PluginInfo {
        uid: Uuid::new_v4().to_string(),
        name: stem,
        vendor: plist_meta.vendor.unwrap_or_else(|| "Unknown".into()),
        version: plist_meta.version.unwrap_or_else(|| "0.0.0".into()),
        category: if main_cat.is_empty() { "Unknown".into() } else { main_cat },
        subcategory: sub_cat,
        path: path.to_string_lossy().to_string(),
    })
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Arc, Mutex as StdMutex};
    use tempfile::TempDir;

    fn make_vst3_bundle(parent: &Path, name: &str) {
        let bundle = parent.join(format!("{name}.vst3"));
        fs::create_dir_all(&bundle).unwrap();
    }

    fn make_vst3_bundle_with_plist(
        parent: &Path,
        name: &str,
        plist_entries: &[(&str, &str)],
    ) -> PathBuf {
        let bundle = parent.join(format!("{name}.vst3"));
        let contents = bundle.join("Contents");
        fs::create_dir_all(&contents).unwrap();

        let mut dict = plist::Dictionary::new();
        for (key, value) in plist_entries {
            dict.insert(key.to_string(), plist::Value::String(value.to_string()));
        }
        let plist_path = contents.join("Info.plist");
        plist::Value::Dictionary(dict)
            .to_file_xml(&plist_path)
            .unwrap();

        bundle
    }

    fn add_moduleinfo(bundle: &Path, subcategories: &[&str]) {
        let resources = bundle.join("Contents/Resources");
        fs::create_dir_all(&resources).unwrap();

        let subcats: Vec<serde_json::Value> = subcategories
            .iter()
            .map(|s| serde_json::Value::String(s.to_string()))
            .collect();

        let json = serde_json::json!({
            "Classes": [
                { "Sub Categories": subcats }
            ]
        });

        fs::write(
            resources.join("moduleinfo.json"),
            serde_json::to_string_pretty(&json).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn scan_finds_vst3_bundles() {
        let tmp = TempDir::new().unwrap();
        make_vst3_bundle(tmp.path(), "Synth1");
        make_vst3_bundle(tmp.path(), "Compressor");

        // Non-vst3 directory and a regular file — must be ignored.
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
    fn scan_caches_results_until_cleared() {
        let tmp = TempDir::new().unwrap();
        make_vst3_bundle(tmp.path(), "CachedPlugin");

        let scanner = PluginScanner::new();
        let first = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(first.len(), 1);

        make_vst3_bundle(tmp.path(), "NewPlugin");
        let second = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(second.len(), 1, "cache must hide newly added bundle");

        scanner.clear_cache();
        let third = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(third.len(), 2);
    }

    #[test]
    fn scan_skips_nonexistent_dirs_without_panicking() {
        let scanner = PluginScanner::new();
        let plugins = scanner.scan(&[PathBuf::from("/tmp/definitely_does_not_exist_12345")]);
        assert!(plugins.is_empty());
    }

    #[test]
    fn is_vst3_bundle_accepts_only_vst3_directories() {
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
    fn plugin_info_falls_back_when_no_plist() {
        let tmp = TempDir::new().unwrap();
        let bundle = tmp.path().join("MySynth.vst3");
        fs::create_dir_all(&bundle).unwrap();

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.name, "MySynth");
        assert_eq!(info.vendor, "Unknown");
        assert_eq!(info.version, "0.0.0");
        assert_eq!(info.category, "Unknown");
        assert!(!info.uid.is_empty());
        assert!(info.path.contains("MySynth.vst3"));
    }

    #[test]
    fn plugin_info_reads_plist_version_and_vendor() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "TestPlugin",
            &[
                ("CFBundleShortVersionString", "3.2.1"),
                ("CFBundleIdentifier", "com.testvendor.TestPlugin"),
            ],
        );

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.name, "TestPlugin");
        assert_eq!(info.version, "3.2.1");
        assert_eq!(info.vendor, "testvendor");
    }

    #[test]
    fn plugin_info_prefers_short_version_then_falls_back_to_bundle_version() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "FallbackPlugin",
            &[("CFBundleVersion", "1.0.5")],
        );

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.version, "1.0.5");
        assert_eq!(info.vendor, "Unknown");
    }

    #[test]
    fn vendor_from_bundle_id_extracts_reverse_dns_middle_segment() {
        assert_eq!(
            vendor_from_bundle_id("com.fabfilter.Pro-Q3"),
            Some("fabfilter".into())
        );
        assert_eq!(
            vendor_from_bundle_id("com.native-instruments.Kontakt"),
            Some("native-instruments".into())
        );
        assert_eq!(
            vendor_from_bundle_id("org.surge-synth-team.surge-xt"),
            Some("surge-synth-team".into())
        );
        assert_eq!(vendor_from_bundle_id("com.single"), None);
        assert_eq!(vendor_from_bundle_id("com.apple.AUPlugin"), None);
    }

    #[test]
    fn vendor_from_copyright_parses_common_formats() {
        assert_eq!(
            vendor_from_copyright("Copyright © 2023 FabFilter"),
            Some("FabFilter".into())
        );
        assert_eq!(
            vendor_from_copyright("© 2024 Steinberg Media Technologies"),
            Some("Steinberg Media Technologies".into())
        );
        assert_eq!(
            vendor_from_copyright("Copyright 2020-2024 Native Instruments. All rights reserved."),
            Some("Native Instruments".into())
        );
        assert_eq!(
            vendor_from_copyright("(c) 2023 Arturia"),
            Some("Arturia".into())
        );
        assert_eq!(vendor_from_copyright(""), None);
        assert_eq!(vendor_from_copyright("©"), None);
    }

    #[test]
    fn vendor_from_copyright_is_used_when_bundle_id_lacks_vendor() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "CopyrightPlugin",
            &[
                ("CFBundleIdentifier", "com"),
                ("NSHumanReadableCopyright", "© 2024 Cool Audio Inc"),
            ],
        );

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.vendor, "Cool Audio Inc");
    }

    #[test]
    fn category_from_moduleinfo_is_split_on_pipe() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "CatPlugin",
            &[("CFBundleIdentifier", "com.test.CatPlugin")],
        );
        add_moduleinfo(&bundle, &["Fx|EQ"]);

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.category, "Fx");
        assert_eq!(info.subcategory, "EQ");
    }

    #[test]
    fn category_is_unknown_without_moduleinfo() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "NoCatPlugin",
            &[("CFBundleIdentifier", "com.test.NoCatPlugin")],
        );

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.category, "Unknown");
    }

    #[test]
    fn plist_at_bundle_root_is_also_honoured() {
        // Some third-party bundles ship Info.plist at the root rather
        // than under Contents/ — we accept both.
        let tmp = TempDir::new().unwrap();
        let bundle = tmp.path().join("RootPlist.vst3");
        fs::create_dir_all(&bundle).unwrap();

        let mut dict = plist::Dictionary::new();
        dict.insert(
            "CFBundleVersion".to_string(),
            plist::Value::String("2.0.0".to_string()),
        );
        dict.insert(
            "CFBundleIdentifier".to_string(),
            plist::Value::String("com.rootvendor.RootPlist".to_string()),
        );
        plist::Value::Dictionary(dict)
            .to_file_xml(bundle.join("Info.plist"))
            .unwrap();

        let info = plugin_info_from_path(&bundle).unwrap();
        assert_eq!(info.version, "2.0.0");
        assert_eq!(info.vendor, "rootvendor");
    }

    #[test]
    fn skip_year_prefix_handles_single_year_and_range() {
        assert_eq!(skip_year_prefix("2023 FabFilter"), "FabFilter");
        assert_eq!(skip_year_prefix("2020-2024 NI"), "NI");
        assert_eq!(skip_year_prefix("FabFilter"), "FabFilter");
        assert_eq!(skip_year_prefix(""), "");
    }

    #[test]
    fn scan_reads_full_metadata_from_well_formed_bundle() {
        let tmp = TempDir::new().unwrap();
        let bundle = make_vst3_bundle_with_plist(
            tmp.path(),
            "FullPlugin",
            &[
                ("CFBundleShortVersionString", "1.2.3"),
                ("CFBundleIdentifier", "com.acme.FullPlugin"),
            ],
        );
        add_moduleinfo(&bundle, &["Instrument|Synth"]);

        let scanner = PluginScanner::new();
        let plugins = scanner.scan(&[tmp.path().to_path_buf()]);
        assert_eq!(plugins.len(), 1);

        let p = &plugins[0];
        assert_eq!(p.name, "FullPlugin");
        assert_eq!(p.vendor, "acme");
        assert_eq!(p.version, "1.2.3");
        assert_eq!(p.category, "Instrument");
        assert_eq!(p.subcategory, "Synth");
    }

    #[test]
    fn scan_with_progress_reports_accurate_total_and_current() {
        let tmp = TempDir::new().unwrap();
        make_vst3_bundle(tmp.path(), "One");
        make_vst3_bundle(tmp.path(), "Two");
        make_vst3_bundle(tmp.path(), "Three");

        let ticks: Arc<StdMutex<Vec<ScanProgress>>> = Arc::new(StdMutex::new(Vec::new()));
        let ticks_inner = Arc::clone(&ticks);

        let scanner = PluginScanner::new();
        let cb = move |p: ScanProgress| {
            ticks_inner.lock().unwrap().push(p);
        };
        let plugins = scanner.scan_with_progress(&[tmp.path().to_path_buf()], Some(&cb));

        assert_eq!(plugins.len(), 3);
        let ticks = ticks.lock().unwrap();
        assert_eq!(ticks.len(), 3, "one tick per discovered plugin");
        for (i, tick) in ticks.iter().enumerate() {
            assert_eq!(tick.total, 3, "total must be the full count on every tick");
            assert_eq!(
                tick.scanned,
                (i + 1) as u32,
                "scanned must advance 1..=total"
            );
            assert!(!tick.current_plugin.is_empty());
        }
    }
}
