//! Tauri IPC commands that drive the native audio engine.
//!
//! The engine itself lives in a `Mutex<Engine>` managed by Tauri state.
//! Every command locks that mutex, performs the operation, and releases —
//! the audio callback runs on its own CPAL-owned thread and is not
//! affected by the mutex.

use std::sync::Mutex;
use tauri::State;

use crate::engine::{
    audio_io, AudioDeviceInfo, Engine, EngineConfig, EngineError, EngineStatus,
};

/// State wrapper around the engine. Tauri requires `Send + Sync`, and
/// `Engine` itself is `!Sync` because it holds a channel sender; the
/// mutex gives us both, and the audio thread lives entirely inside the
/// engine so the lock is never held across an audio callback.
pub struct EngineState(pub Mutex<Engine>);

impl EngineState {
    pub fn new() -> Self {
        Self(Mutex::new(Engine::new()))
    }
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn audio_list_devices() -> Vec<AudioDeviceInfo> {
    audio_io::list_output_devices()
}

#[tauri::command]
pub fn audio_get_default_device() -> Option<AudioDeviceInfo> {
    audio_io::get_default_output_device_info()
}

#[tauri::command]
pub fn audio_start_engine(
    config: EngineConfig,
    state: State<'_, EngineState>,
) -> Result<EngineStatus, EngineError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    engine.start(config)
}

#[tauri::command]
pub fn audio_stop_engine(state: State<'_, EngineState>) -> Result<(), EngineError> {
    let mut engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    engine.stop();
    Ok(())
}

#[tauri::command]
pub fn audio_get_engine_status(
    state: State<'_, EngineState>,
) -> Result<EngineStatus, EngineError> {
    let engine = state
        .0
        .lock()
        .map_err(|_| EngineError::Open("engine mutex poisoned".into()))?;
    Ok(engine.status())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The state wrapper is `Send + Sync` — Tauri's `State<T>` requires it.
    #[test]
    fn engine_state_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<EngineState>();
    }

    #[test]
    fn engine_state_starts_stopped() {
        let state = EngineState::new();
        let engine = state.0.lock().unwrap();
        assert_eq!(engine.status(), EngineStatus::Stopped);
    }
}
