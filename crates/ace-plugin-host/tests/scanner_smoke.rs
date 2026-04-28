//! Crate-boundary smoke test — exercises the public API the way a
//! Tauri command handler will in 4A-2.

use std::fs;
use tempfile::TempDir;

use ace_plugin_host::{PluginScanner, ScanProgress};

#[test]
fn public_api_scans_tempdir_and_exposes_plugin_info_fields() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join("Alpha.vst3/Contents")).unwrap();
    fs::create_dir_all(tmp.path().join("Beta.vst3/Contents")).unwrap();

    let scanner = PluginScanner::new();
    let plugins = scanner.scan(&[tmp.path().to_path_buf()]);

    assert_eq!(plugins.len(), 2);
    for p in &plugins {
        assert!(!p.uid.is_empty());
        assert!(!p.name.is_empty());
        assert!(p.path.ends_with(".vst3"));
    }
}

#[test]
fn public_api_scan_with_progress_emits_ticks_through_callback() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join("Solo.vst3")).unwrap();

    let received: std::sync::Arc<std::sync::Mutex<Vec<ScanProgress>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let received_inner = std::sync::Arc::clone(&received);

    let scanner = PluginScanner::new();
    let cb = move |p: ScanProgress| {
        received_inner.lock().unwrap().push(p);
    };
    let plugins = scanner.scan_with_progress(&[tmp.path().to_path_buf()], Some(&cb));

    assert_eq!(plugins.len(), 1);
    let ticks = received.lock().unwrap();
    assert_eq!(ticks.len(), 1);
    assert_eq!(ticks[0].scanned, 1);
    assert_eq!(ticks[0].total, 1);
    assert_eq!(ticks[0].current_plugin, "Solo");
}
