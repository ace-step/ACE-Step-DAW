//! Shared data types for the plugin host. Kept deliberately small —
//! these are the shapes that cross the Tauri IPC boundary and show up
//! in the UI layer, so every field is serde-friendly and camelCased on
//! the wire.

use serde::{Deserialize, Serialize};

/// Metadata about a discovered VST3 plugin bundle. Produced by the
/// scanner, surfaced to the UI via a Tauri command. Identical shape to
/// the legacy `companion` app's `PluginInfo` so the existing
/// `src/types/vst3.ts` bindings continue to work.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    /// Opaque unique identifier assigned at scan time. Stable within a
    /// single process run but not persisted across scans — callers that
    /// need persistent identity key on `path`.
    pub uid: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub category: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub subcategory: String,
    /// Absolute path to the `.vst3` bundle directory.
    pub path: String,
}

/// Progress emitted while a scan is running. Shaped to drive a simple
/// "N of M — Plugin X" status UI without the caller needing to buffer
/// intermediate state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned: u32,
    pub total: u32,
    pub current_plugin: String,
}
