//! Error type for the plugin host.
//!
//! Every fallible operation — scanning, loading, instantiating,
//! releasing — returns `Result<_, PluginHostError>`. The variants map
//! one-to-one onto failure modes the frontend can reasonably act on.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginHostError {
    /// The bundle path didn't resolve to a loadable dylib — either the
    /// path is wrong, the bundle is malformed, or `Contents/MacOS` is
    /// empty.
    #[error("plugin bundle is not loadable: {0}")]
    InvalidBundle(String),

    /// `libloading::Library::new` or `GetPluginFactory` lookup failed.
    #[error("failed to load plugin: {0}")]
    LoadFailed(String),

    /// VST3 factory exists but produced no usable class / instance.
    #[error("plugin instantiation failed: {0}")]
    InstantiateFailed(String),

    /// A plugin was expected to expose `IAudioProcessor` (or similar)
    /// but did not.
    #[error("plugin is missing required interface: {0}")]
    MissingInterface(String),

    /// `plugin_release` / registry lookup was given an instance_id
    /// that is not (or is no longer) live.
    #[error("no such plugin instance: {0}")]
    UnknownInstance(String),

    /// A mutex guarding the host registry was poisoned — usually the
    /// result of a panic inside another command on the same state.
    #[error("plugin host registry is unavailable")]
    RegistryUnavailable,
}
