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

// Temporarily simplified to isolate CI build panic.
// Full version uses tauri::generate_context!() which requires tauri_build::build().
pub fn run() {
    println!("ACE-Step DAW placeholder — tauri_build disabled for CI debugging");
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
