mod commands;
mod settings;

use kokoro_en::KokoroTts;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub struct AppState {
    pub tts: KokoroTts,
    pub voices: Vec<String>,
    pub history_path: PathBuf,
    pub settings_path: PathBuf,
}

fn resolve_resource(dir: &Path, name: &str) -> PathBuf {
    let candidates = [
        dir.join(name),
        dir.join("resources").join(name),
    ];
    candidates.iter().find(|p| p.exists()).cloned().unwrap_or_else(|| candidates[0].clone())
}

fn collect_voices(voices_path: &Path) -> Vec<String> {
    let mut voices = Vec::new();
    if let Ok(entries) = std::fs::read_dir(voices_path) {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|e| e == "bin") {
                if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    voices.push(stem.to_string());
                }
            }
        }
    }
    voices.sort();
    voices
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let resource_dir = app.path().resource_dir()?;
            let model_path = resolve_resource(&resource_dir, "model.onnx");
            let voices_path = resolve_resource(&resource_dir, "voices");

            let voices = collect_voices(&voices_path);

            let history_path = app.path().app_data_dir()?.join("history");
            let settings_path = app.path().app_data_dir()?.join("settings.json");

            let tts = tauri::async_runtime::block_on(
                KokoroTts::new(&model_path, &voices_path),
            )
            .expect("Failed to initialize KokoroTts");

            app.manage(AppState { tts, voices, history_path, settings_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_voices,
            commands::synth,
            commands::save_audio,
            commands::get_history,
            commands::load_history_audio,
            commands::delete_history_entry,
            commands::save_history_audio,
            commands::clear_history,
            commands::get_settings,
            commands::save_settings,
            commands::get_save_directory,
            commands::get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
