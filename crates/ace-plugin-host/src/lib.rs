//! VST3 plugin host for ACE-Step DAW.
//!
//! Phase 4A-1 scope: filesystem scanning only. Plugin *loading*
//! (`libloading` + the `vst3` crate) arrives in a later subphase so the
//! unsafe surface stays strictly additive as each capability lands.
//!
//! This crate is deliberately Tauri-free — Tauri command wiring lives
//! in `src-tauri/` and depends on this crate through plain function
//! calls, keeping the host logic unit-testable without a Tauri runtime.

pub mod scanner;
pub mod types;

pub use scanner::{PluginScanner, ScanProgressCallback};
pub use types::{PluginInfo, ScanProgress};
