//! VST3 plugin host for ACE-Step DAW.
//!
//! Phase 4A ships in three vertical slices so each PR is audit-able:
//!
//! - **4A-1** (#1755): filesystem scanning (read-only)
//! - **4A-2** (#1757): Tauri commands exposing the scanner
//! - **4A-3** (#1758): plugin instantiation — `libloading` + the
//!   `vst3` crate COM bindings, plus an instance registry and
//!   host-side IComponentHandler/IHostApplication
//! - **4B-1** (this crate version): audio-processing lifecycle —
//!   `setupProcessing` → `setActive` → `process()` → deactivate,
//!   stereo-only, no MIDI / parameter changes yet
//!
//! MIDI + parameter changes into `process()`, multi-output busses,
//! preset state, editor GUIs, sidechains, and latency compensation
//! live in Phase 4B-2 / 4B-3 / 4C / 4D.
//!
//! This crate is deliberately Tauri-free — Tauri command wiring lives
//! in `src-tauri/` and depends on this crate through plain function
//! calls, keeping the host logic unit-testable without a Tauri runtime.

pub mod audio;
pub mod error;
pub mod host;
pub mod host_impl;
pub mod loader;
pub mod midi;
pub mod params;
pub mod scanner;
pub mod types;

pub use audio::{AudioConfig, OutputBusConfig, ProcessingState};
pub use error::PluginHostError;
pub use host::PluginHost;
pub use host_impl::{AceComponentHandler, AceHostApplication, HostParamChange, ParamChangeCollector};
pub use loader::{load_plugin, Vst3PluginInstance};
pub use midi::{midi_to_vst3_event, EventList, MidiEvent};
pub use params::{ParamPoint, ParamValueQueue, ParameterChanges};
pub use scanner::{PluginScanner, ScanProgressCallback};
pub use types::{InstanceInfo, OutputBusInfo, ParamInfo, PluginInfo, ScanProgress};
