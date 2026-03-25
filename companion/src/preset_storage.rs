//! Disk-backed preset storage for VST3 plugin state.
//!
//! Presets are stored at `~/.ace-step/presets/{plugin_uid}/{preset_name}.vstpreset`.

use std::fs;
use std::path::PathBuf;

use tracing::info;

use crate::error::{CompanionError, Result};

/// Manages named presets on disk for VST3 plugins.
pub struct PresetStorage {
    base_dir: PathBuf,
}

impl PresetStorage {
    /// Create a new `PresetStorage` using the default directory (`~/.ace-step/presets`).
    pub fn new() -> Result<Self> {
        let home = std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|_| CompanionError::Plugin("Cannot determine home directory".into()))?;
        let base_dir = home.join(".ace-step").join("presets");
        Ok(Self { base_dir })
    }

    /// Create a `PresetStorage` rooted at a custom directory (for testing).
    pub fn with_base_dir(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    /// Directory for a specific plugin's presets.
    fn plugin_dir(&self, plugin_uid: &str) -> PathBuf {
        // Sanitize plugin_uid to be filesystem-safe
        let safe_uid: String = plugin_uid
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        self.base_dir.join(safe_uid)
    }

    /// Full path for a preset file.
    fn preset_path(&self, plugin_uid: &str, name: &str) -> PathBuf {
        let safe_name: String = name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
            .collect();
        self.plugin_dir(plugin_uid).join(format!("{safe_name}.vstpreset"))
    }

    /// Save state bytes as a named preset.
    pub fn save(&self, plugin_uid: &str, name: &str, state_bytes: &[u8]) -> Result<()> {
        let dir = self.plugin_dir(plugin_uid);
        fs::create_dir_all(&dir)?;

        let path = self.preset_path(plugin_uid, name);
        fs::write(&path, state_bytes)?;
        info!(plugin_uid, name, bytes = state_bytes.len(), path = %path.display(), "Saved preset");
        Ok(())
    }

    /// Load a named preset, returning its state bytes.
    pub fn load(&self, plugin_uid: &str, name: &str) -> Result<Vec<u8>> {
        let path = self.preset_path(plugin_uid, name);
        if !path.exists() {
            return Err(CompanionError::Plugin(format!(
                "Preset '{}' not found for plugin '{}'",
                name, plugin_uid
            )));
        }
        let data = fs::read(&path)?;
        info!(plugin_uid, name, bytes = data.len(), "Loaded preset");
        Ok(data)
    }

    /// List available preset names for a plugin.
    pub fn list(&self, plugin_uid: &str) -> Vec<String> {
        let dir = self.plugin_dir(plugin_uid);
        if !dir.exists() {
            return vec![];
        }

        let mut names: Vec<String> = fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("vstpreset") {
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .map(String::from)
                } else {
                    None
                }
            })
            .collect();

        names.sort();
        names
    }

    /// Delete a named preset.
    pub fn delete(&self, plugin_uid: &str, name: &str) -> Result<()> {
        let path = self.preset_path(plugin_uid, name);
        if !path.exists() {
            return Err(CompanionError::Plugin(format!(
                "Preset '{}' not found for plugin '{}'",
                name, plugin_uid
            )));
        }
        fs::remove_file(&path)?;
        info!(plugin_uid, name, "Deleted preset");
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_storage() -> (tempfile::TempDir, PresetStorage) {
        let dir = tempfile::tempdir().unwrap();
        let storage = PresetStorage::with_base_dir(dir.path().to_path_buf());
        (dir, storage)
    }

    #[test]
    fn save_and_load_preset() {
        let (_dir, storage) = temp_storage();
        let state = vec![1, 2, 3, 4, 5];

        storage.save("synth-uid-123", "My Preset", &state).unwrap();
        let loaded = storage.load("synth-uid-123", "My Preset").unwrap();
        assert_eq!(loaded, state);
    }

    #[test]
    fn load_nonexistent_preset_errors() {
        let (_dir, storage) = temp_storage();
        let result = storage.load("synth-uid-123", "Missing");
        assert!(result.is_err());
    }

    #[test]
    fn list_presets_empty() {
        let (_dir, storage) = temp_storage();
        let names = storage.list("synth-uid-123");
        assert!(names.is_empty());
    }

    #[test]
    fn list_presets_returns_sorted_names() {
        let (_dir, storage) = temp_storage();
        storage.save("uid-1", "Zebra", &[1]).unwrap();
        storage.save("uid-1", "Alpha", &[2]).unwrap();
        storage.save("uid-1", "Middle", &[3]).unwrap();

        let names = storage.list("uid-1");
        assert_eq!(names, vec!["Alpha", "Middle", "Zebra"]);
    }

    #[test]
    fn list_presets_different_plugins_are_isolated() {
        let (_dir, storage) = temp_storage();
        storage.save("uid-1", "Preset A", &[1]).unwrap();
        storage.save("uid-2", "Preset B", &[2]).unwrap();

        assert_eq!(storage.list("uid-1"), vec!["Preset A"]);
        assert_eq!(storage.list("uid-2"), vec!["Preset B"]);
    }

    #[test]
    fn delete_preset() {
        let (_dir, storage) = temp_storage();
        storage.save("uid-1", "ToDelete", &[1, 2, 3]).unwrap();
        assert_eq!(storage.list("uid-1").len(), 1);

        storage.delete("uid-1", "ToDelete").unwrap();
        assert!(storage.list("uid-1").is_empty());
    }

    #[test]
    fn delete_nonexistent_preset_errors() {
        let (_dir, storage) = temp_storage();
        let result = storage.delete("uid-1", "Nope");
        assert!(result.is_err());
    }

    #[test]
    fn save_overwrites_existing_preset() {
        let (_dir, storage) = temp_storage();
        storage.save("uid-1", "Patch", &[1, 2, 3]).unwrap();
        storage.save("uid-1", "Patch", &[4, 5, 6, 7]).unwrap();

        let loaded = storage.load("uid-1", "Patch").unwrap();
        assert_eq!(loaded, vec![4, 5, 6, 7]);
    }

    #[test]
    fn plugin_uid_with_special_chars_is_sanitized() {
        let (_dir, storage) = temp_storage();
        storage.save("uid/with:special<chars>", "Test", &[42]).unwrap();
        let loaded = storage.load("uid/with:special<chars>", "Test").unwrap();
        assert_eq!(loaded, vec![42]);
    }
}
