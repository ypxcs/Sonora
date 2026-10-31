use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub default_voice: Option<String>,
    pub default_speed: f32,
    pub audio_format: String,
    pub default_directory: Option<String>,
    /// Parent directory of the most recent successful save. Backend-owned:
    /// the frontend round-trips it untouched, and it seeds the save dialog
    /// whenever `default_directory` is unset.
    #[serde(default)]
    pub last_save_directory: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_voice: None,
            default_speed: 1.0,
            audio_format: "wav".into(),
            default_directory: None,
            last_save_directory: None,
        }
    }
}

impl Settings {
    pub fn load(path: &PathBuf) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("Serialize failed: {e}"))?;
        std::fs::write(path, json).map_err(|e| format!("Write failed: {e}"))
    }
}
