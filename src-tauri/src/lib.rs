pub mod commands;
pub mod engine;

use tauri::Manager;

use crate::commands::audio::{
    audio_add_track, audio_clip_get_schedule, audio_clip_set_schedule,
    audio_get_default_device, audio_get_engine_status, audio_list_devices,
    audio_metronome_get_config, audio_metronome_set_config, audio_metronome_set_enabled,
    audio_remove_track, audio_set_master_volume, audio_set_track_params,
    audio_start_engine, audio_stop_engine, audio_transport_get_count_in,
    audio_transport_get_punch_region, audio_transport_scrub,
    audio_transport_set_count_in, audio_transport_set_punch_enabled,
    audio_transport_set_punch_region,
    audio_transport_beat_to_sample, audio_transport_get_loop_region,
    audio_transport_get_position, audio_transport_get_tempo_map,
    audio_transport_get_time_signature_map, audio_transport_pause, audio_transport_play,
    audio_transport_sample_to_beat, audio_transport_seek, audio_transport_set_loop_enabled,
    audio_transport_set_loop_region, audio_transport_set_tempo,
    audio_transport_set_tempo_map, audio_transport_set_time_signature_map,
    audio_transport_stop, EngineState, TransportEmitterState,
};
use crate::commands::plugin::{
    plugin_instantiate, plugin_list_cached, plugin_list_instances, plugin_release, plugin_rescan,
    plugin_scan, PluginHostState, PluginScannerState,
};

/// Greet command — placeholder to verify IPC works.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! ACE-Step DAW desktop mode is active.", name)
}

/// Check if running inside Tauri (always true from Rust side).
#[tauri::command]
fn is_desktop() -> bool {
    true
}

pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::new())
        .manage(TransportEmitterState::new())
        .manage(PluginScannerState::new())
        .manage(PluginHostState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            is_desktop,
            audio_list_devices,
            audio_get_default_device,
            audio_start_engine,
            audio_stop_engine,
            audio_get_engine_status,
            audio_add_track,
            audio_remove_track,
            audio_set_track_params,
            audio_set_master_volume,
            audio_transport_play,
            audio_transport_stop,
            audio_transport_pause,
            audio_transport_seek,
            audio_transport_set_tempo,
            audio_transport_get_position,
            audio_transport_set_tempo_map,
            audio_transport_get_tempo_map,
            audio_transport_set_time_signature_map,
            audio_transport_get_time_signature_map,
            audio_transport_beat_to_sample,
            audio_transport_sample_to_beat,
            audio_transport_set_loop_region,
            audio_transport_get_loop_region,
            audio_transport_set_loop_enabled,
            audio_metronome_set_config,
            audio_metronome_get_config,
            audio_metronome_set_enabled,
            audio_clip_set_schedule,
            audio_clip_get_schedule,
            audio_transport_scrub,
            audio_transport_set_punch_region,
            audio_transport_get_punch_region,
            audio_transport_set_punch_enabled,
            audio_transport_set_count_in,
            audio_transport_get_count_in,
            plugin_scan,
            plugin_list_cached,
            plugin_rescan,
            plugin_instantiate,
            plugin_release,
            plugin_list_instances,
        ])
        .setup(|app| {
            // Focus main window on startup
            if let Some(window) = app.get_webview_window("main") {
                window.set_focus().ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ACE-Step DAW");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_returns_formatted_string() {
        let result = greet("Alice");
        assert_eq!(result, "Hello, Alice! ACE-Step DAW desktop mode is active.");
    }

    #[test]
    fn greet_handles_empty_name() {
        let result = greet("");
        assert_eq!(result, "Hello, ! ACE-Step DAW desktop mode is active.");
    }

    #[test]
    fn is_desktop_returns_true() {
        assert!(is_desktop());
    }
}
