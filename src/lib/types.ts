export interface SynthResult {
  audio: string;
  format: string;
  sample_rate: number;
}

/** Metadata shown in the Settings → About pane. */
export interface AppInfo {
  version: string;
  data_dir: string;
}

export interface HistoryEntry {
  id: string;
  text: string;
  voice: string;
  timestamp: number;
}

/** Returned by `synth`: audio for immediate playback plus the persisted history entry. */
export interface SynthSaveResult extends SynthResult {
  entry: HistoryEntry;
}

export interface Settings {
  default_voice: string | null;
  default_speed: number;
  audio_format: string;
  default_directory: string | null;
  /** Directory of the most recent save. Backend-owned: read-only for the
   *  frontend, which round-trips it untouched when saving settings. */
  last_save_directory: string | null;
}
