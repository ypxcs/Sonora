use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

use crate::settings::Settings;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SynthResult {
    pub audio: String,
    pub format: String,
    pub sample_rate: u32,
}

/// `synth` also persists the clip to history, so it returns the created entry
/// alongside the audio for immediate playback.
#[derive(Debug, Serialize, Deserialize)]
pub struct SynthSaveResult {
    pub audio: String,
    pub format: String,
    pub sample_rate: u32,
    pub entry: HistoryEntry,
}

/// App metadata for the About pane.
#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub text: String,
    pub voice: String,
    pub timestamp: u64,
}

#[tauri::command]
pub fn list_voices(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.voices.clone())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(Settings::load(&state.settings_path))
}

/// App metadata for the About pane: packaged version and the app data
/// directory (where `settings.json` and `history/` live).
#[tauri::command]
pub fn get_app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Data dir unavailable: {e}"))?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<(), String> {
    // `last_save_directory` is backend-owned (updated by the save dialog); the
    // frontend only round-trips it, so keep whatever is on disk.
    settings.last_save_directory = Settings::load(&state.settings_path).last_save_directory;
    settings.save(&state.settings_path)
}

/// The save location Settings displays: the configured default directory,
/// else the last directory saved to, else the home directory. Reports what
/// is *configured* even if that folder is gone, so a stale path stays
/// visible for the user to fix.
#[tauri::command]
pub fn get_save_directory(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let settings = Settings::load(&state.settings_path);
    let dir = settings
        .default_directory
        .clone()
        .or(settings.last_save_directory.clone())
        .map(PathBuf::from)
        .or_else(|| app.path().home_dir().ok());
    Ok(dir.map(|p| p.to_string_lossy().to_string()))
}

const MAX_TEXT_LENGTH: usize = 400;

#[tauri::command]
pub async fn synth(
    state: State<'_, AppState>,
    text: String,
    voice: String,
    speed: f32,
) -> Result<SynthSaveResult, String> {
    if text.len() > MAX_TEXT_LENGTH {
        return Err(format!(
            "Text exceeds maximum length of {MAX_TEXT_LENGTH} characters (got {})",
            text.len()
        ));
    }
    let voice_name = voice;
    let voice = kokoro_en::Voice::new(&voice_name).with_speed(speed);
    let (samples, _took) = state
        .tts
        .synth(&text, voice)
        .await
        .map_err(|e| format!("Synth failed: {e}"))?;

    let wav_bytes = encode_wav(&samples, 24000);
    // Persist here so the frontend never has to ship the audio bytes back over
    // IPC just to save them.
    let entry = append_history(&state, text, voice_name, &wav_bytes)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    Ok(SynthSaveResult {
        audio: b64,
        format: "wav".into(),
        sample_rate: 24000,
        entry,
    })
}

/// Append a finished clip to the on-disk history and return its entry.
fn append_history(
    state: &AppState,
    text: String,
    voice: String,
    audio: &[u8],
) -> Result<HistoryEntry, String> {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .to_string();

    let history_dir = &state.history_path;
    std::fs::create_dir_all(history_dir).map_err(|e| format!("Dir create failed: {e}"))?;

    let wav_path = history_dir.join(format!("{id}.wav"));
    std::fs::write(&wav_path, audio).map_err(|e| format!("Write failed: {e}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let entry = HistoryEntry {
        id,
        text,
        voice,
        timestamp,
    };

    let json_path = history_dir.join("history.json");
    let mut entries: Vec<HistoryEntry> = if json_path.exists() {
        let content = std::fs::read_to_string(&json_path).map_err(|e| format!("Read failed: {e}"))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    entries.push(entry.clone());
    let json = serde_json::to_string(&entries).map_err(|e| format!("Serialize failed: {e}"))?;
    std::fs::write(&json_path, json).map_err(|e| format!("Write failed: {e}"))?;

    Ok(entry)
}

#[tauri::command]
pub fn get_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, String> {
    let json_path = state.history_path.join("history.json");
    if !json_path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&json_path).map_err(|e| format!("Read failed: {e}"))?;
    let mut entries: Vec<HistoryEntry> =
        serde_json::from_str(&content).map_err(|e| format!("Parse failed: {e}"))?;
    entries.reverse();
    Ok(entries)
}

#[tauri::command]
pub fn load_history_audio(
    state: State<'_, AppState>,
    id: String,
) -> Result<SynthResult, String> {
    let wav_path = state.history_path.join(format!("{id}.wav"));
    let bytes = std::fs::read(&wav_path).map_err(|e| format!("Read failed: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(SynthResult {
        audio: b64,
        format: "wav".into(),
        sample_rate: 24000,
    })
}

#[tauri::command]
pub fn delete_history_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let json_path = state.history_path.join("history.json");
    let wav_path = state.history_path.join(format!("{id}.wav"));

    let _ = std::fs::remove_file(&wav_path);

    if json_path.exists() {
        let content = std::fs::read_to_string(&json_path).map_err(|e| format!("Read failed: {e}"))?;
        let mut entries: Vec<HistoryEntry> =
            serde_json::from_str(&content).map_err(|e| format!("Parse failed: {e}"))?;
        entries.retain(|e| e.id != id);
        let json = serde_json::to_string(&entries).map_err(|e| format!("Serialize failed: {e}"))?;
        std::fs::write(&json_path, json).map_err(|e| format!("Write failed: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn save_history_audio(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    default_name: String,
) -> Result<String, String> {
    let wav_path = state.history_path.join(format!("{id}.wav"));
    let data = std::fs::read(&wav_path).map_err(|e| format!("Read failed: {e}"))?;
    write_with_dialog(&app, &state, &data, &default_name)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let history_dir = &state.history_path;
    if let Ok(entries) = std::fs::read_dir(history_dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn save_audio(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    data: Vec<u8>,
    default_name: String,
) -> Result<String, String> {
    write_with_dialog(&app, &state, &data, &default_name)
}

/// Directory the save dialog opens in: the configured default directory,
/// else the last directory actually saved to, else the user's home. Stale
/// paths are skipped so the dialog never starts in a deleted folder.
fn dialog_start_dir(app: &tauri::AppHandle, settings: &Settings) -> Option<PathBuf> {
    let existing =
        |dir: &Option<String>| dir.as_deref().map(PathBuf::from).filter(|p| p.exists());
    existing(&settings.default_directory)
        .or_else(|| existing(&settings.last_save_directory))
        .or_else(|| app.path().home_dir().ok())
}

/// Prompt for a save location (honouring the configured default directory) and
/// write `data` there. Shared by `save_audio` and `save_history_audio`.
fn write_with_dialog(
    app: &tauri::AppHandle,
    state: &AppState,
    data: &[u8],
    default_name: &str,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut settings = Settings::load(&state.settings_path);
    let ext = &settings.audio_format;
    // Truncate on char boundaries so multi-byte names can't panic.
    let stem: String = default_name.chars().take(60).collect();

    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Audio", &[ext.as_str()])
        .set_file_name(format!("{stem}.{ext}"));

    if let Some(dir) = dialog_start_dir(app, &settings) {
        dialog = dialog.set_directory(dir);
    }

    match dialog.blocking_save_file() {
        Some(p) => {
            let p = p.as_path().unwrap();
            std::fs::write(p, data).map_err(|e| format!("Write failed: {e}"))?;
            // Remember where the user actually saved so the next dialog — and
            // the path Settings shows — starts there.
            if let Some(parent) = p.parent() {
                let parent = parent.to_string_lossy().into_owned();
                if settings.last_save_directory.as_deref() != Some(parent.as_str()) {
                    settings.last_save_directory = Some(parent);
                    // Best-effort: failing to record this must not fail the save.
                    let _ = settings.save(&state.settings_path);
                }
            }
            Ok(p.to_string_lossy().to_string())
        }
        None => Err("Cancelled".into()),
    }
}

fn encode_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    use hound::{WavSpec, WavWriter};
    use std::io::Cursor;

    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    let mut writer = WavWriter::new(&mut cursor, spec).unwrap();
    for &s in samples {
        let sample = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(sample).unwrap();
    }
    writer.finalize().unwrap();
    cursor.into_inner()
}
