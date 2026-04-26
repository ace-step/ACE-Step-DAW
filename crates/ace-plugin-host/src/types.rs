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

/// Metadata for a single VST3 parameter. Values are always 0..1
/// normalised — plugins expose their own display transforms behind
/// the scenes, but the host only ever sees and writes normalised
/// values across the API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParamInfo {
    pub id: u32,
    pub name: String,
    pub default_value: f64,
    pub min_value: f64,
    pub max_value: f64,
    pub unit: String,
}

/// A VST3 output audio bus (e.g. "Main Out" mono/stereo, plus optional
/// auxiliary outputs for multi-out drum plugins).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutputBusInfo {
    pub name: String,
    pub channels: u32,
    pub index: u32,
}

/// Snapshot of a live plugin instance returned by `plugin_instantiate`
/// and `plugin_list_instances`. The frontend uses this to render the
/// parameter UI and wire routing — the actual COM handles live in
/// the Rust registry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstanceInfo {
    pub instance_id: String,
    /// VST3 class UID (formatted as a UUID string).
    pub plugin_uid: String,
    /// Bundle path the instance was loaded from — handy for
    /// reloading after a scan-cache purge without re-matching on
    /// PluginInfo.uid (which is assigned at scan time).
    pub bundle_path: String,
    pub parameters: Vec<ParamInfo>,
    pub output_busses: Vec<OutputBusInfo>,
    pub latency_samples: u32,
    pub tail_samples: u32,
}
