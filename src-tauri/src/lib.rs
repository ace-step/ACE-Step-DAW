use tauri::Manager;

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
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, is_desktop])
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
