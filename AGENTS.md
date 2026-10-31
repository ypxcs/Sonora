# Sonora

A Tauri v2 desktop app for generating speech from text using the Kokoro TTS model.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | SolidJS + Tailwind CSS v4 |
| TTS engine | `kokoro-en` (Rust crate, ONNX Runtime) |
| Model | Kokoro-82M fp32 (~325 MB) |
| Font | Manrope (bundled variable font via `@fontsource-variable/manrope`) |

## Architecture

```
┌─────────────────────────────────────────┐
│           Tauri App (Sonora)           │
│                                         │
│  ┌───────────┐      ┌──────────────┐   │
│  │ SolidJS   │◄────►│ Rust Backend │   │
│  │ Tailwind  │ Tauri│ (kokoro-en)  │   │
│  └───────────┘ cmds └──────┬───────┘   │
│                            │            │
│  Bundled: model.onnx       │            │
│           voices/*.bin     │            │
└─────────────────────────────────────────┘
```

The TTS engine runs **in-process** via the `kokoro-en` crate — no sidecar, no HTTP, no Python. The Rust backend manages the model lifecycle and exposes Tauri commands to the frontend.

## Tauri Commands

| Command | Args | Returns |
|---------|------|---------|
| `list_voices` | — | `Vec<String>` (voice names) |
| `synth` | `text`, `voice`, `speed` | `SynthSaveResult` (base64 WAV + persisted `HistoryEntry`) |
| `save_audio` | `data: Vec<u8>`, `default_name` | saved file path |
| `get_settings` | — | `Settings` |
| `save_settings` | `settings` | — (auto-saved; `last_save_directory` stays backend-owned) |
| `get_save_directory` | — | `Option<String>` (effective save folder: configured default → last saved → home) |
| `get_app_info` | — | `{ version, data_dir }` (Settings → About) |
| `get_history` | — | `HistoryEntry[]` (newest first) |
| `load_history_audio` | `id` | `SynthResult` |
| `save_history_audio` | `id`, `default_name` | saved file path |
| `delete_history_entry` | `id` | — |
| `clear_history` | — | — |

Handlers live in `src-tauri/src/commands.rs`. The `KokoroTts` instance is managed as Tauri state. `synth` persists the clip to history itself, so the frontend never ships audio bytes back over IPC to save them. Both save commands share one `write_with_dialog` helper; settings live in `src-tauri/src/settings.rs`. `write_with_dialog` also records the directory of each successful save into `last_save_directory` (a backend-owned settings field the frontend round-trips untouched) and seeds every dialog with the effective folder — configured default → last saved → home (skipping stale paths). `get_save_directory` reports that same path so the Settings panel can display it instead of "OS default".

## Frontend Components (`src/components/`)

| Component | Role |
|-----------|------|
| `Toolbar` | Unified title bar: drag region, New/History/Settings buttons (hairline divider before Settings) |
| `Sheet` | Modal sheet primitive (used by Settings) |
| `SlideOver` | Right-docked panel primitive (used by History) |
| `ControlRail` | Right control column: voice, speed (+reset) on top; Generate pinned to the bottom |
| `VoiceSelector` | Searchable, keyboard-navigable dropdown populated from `list_voices`; portal-rendered menu (opens up/down) so sheets don't clip it; optional label/None |
| `TextInput` | Editor card that fills the left column up to 280px; typing, ⌘↵, or drop a `.txt` (replaces text); inline character counter |
| `SpeedControl` | Slider for speaking rate (0.5–2.0×) with reset-to-1× button |
| `GenerateButton` | Primary button, calls `synth`, shows loading spinner |
| `AudioPlayer` | Always-visible pill (play/pause, seek, time) driving a hidden `<audio>` element; disabled until a clip exists |
| `SaveButton` | Opens the OS save dialog and writes WAV; compact icon variant, disabled when no clip exists |
| `HistoryPanel` | Searchable list of past clips: replay, re-use, download, delete |
| `SettingsPanel` | Two-pane settings (Defaults / Saving / About); custom voice picker with None, speed reset, auto-save; Reset restores defaults |
| `icons` | Inline SVG icon set (no icon dependency) |

Root component `App.tsx` composes these. **The editor and controls share a split view**: the text editor (plus the audio pill) takes the flexible left column, and the `ControlRail` holds voice, speed, and Generate on the right. New is a toolbar action. History and Settings are secondary surfaces opened from the toolbar (`overlay` signal) — History as a right slide-over, Settings as a two-pane modal sheet. State managed with Solid signals — no store/router needed. Shared helpers live in `src/lib/` (`types.ts`, `audio.ts` for base64/WAV/object-URL handling, `format.ts` for recording names, relative times, and media durations, `constants.ts` for the input cap).

## UI Layout

Native macOS-style chrome: Manrope (bundled, no network) with system fallbacks, semantic light/dark tokens (see `index.css`), translucent toolbar/sheets with backdrop blur, hairline separators. The window is fixed at 820×440 and non-resizable, sized so the editor, audio pill, and rail fill it without dead space. The window uses `titleBarStyle: "Overlay"` + `hiddenTitle` so content extends under the traffic lights; `trafficLightPosition` centers them with the 44px toolbar (on macOS the light center lands ≈ `y` px from the top, so keep `y` ≈ toolbar height / 2 — currently 22).

On **Linux** none of those keys apply (they're macOS-only and ignored), so `tauri.linux.conf.json` merges a window override that keeps the native GTK decorations. `Toolbar` therefore drops the 76px traffic-light inset and the centered title when `isMacOS()` (`src/lib/platform.ts`) is false, and `formatShortcut()` renders `Ctrl+N` / `Ctrl+Enter` instead of `⌘N` / `⌘↵` in tooltips. The Linux file also declares the bundle targets (`deb`, `rpm`, `appimage`), the `.deb` runtime deps, and `appimage.bundleMediaFramework: true` — the latter is required because `<audio>` playback in WebKitGTK goes through GStreamer.

With `Overlay`, the native title-bar drag is gone, so the window is dragged via the `Toolbar`'s `data-tauri-drag-region="deep"` attribute. That attribute invokes `plugin:window|start_dragging`, which is **not** part of `core:default` — the `core:window:allow-start-dragging` permission must stay in `src-tauri/capabilities/default.json` or the window becomes undraggable. `"deep"` makes the whole toolbar subtree draggable while clickable children (buttons/inputs) still block drag.

Dropping a `.txt` onto the textarea uses the webview's HTML5 drag-and-drop, which requires `"dragDropEnabled": false` on the window — with Tauri's native drop handler enabled (the default) the `drop`/`dataTransfer.files` events never reach the frontend.

**Identifier = data directory.** `tauri.conf.json > identifier` (`com.ymac.sonora`) is the sole input to `app_data_dir()`, so history and `settings.json` live at `~/Library/Application Support/com.ymac.sonora/` on macOS and `~/.local/share/com.ymac.sonora/` on Linux (shown in Settings → About). Changing the identifier silently orphans that data (and on macOS also re-scopes the code-signing identity), so treat it as frozen once anything ships.

```
┌──────────────────────────────────────────────────────┐
│  ●●●   Sonora                    ✚ ⏱︎ │ ⚙︎           │  toolbar (drag region)
├──────────────────────────────────────────────────────┤
│  ┌── editor card ─────────────────────┐  ┌─ rail ───┐ │
│  │  Enter text to speak...            │  │ Voice    │ │
│  │                                    │  │ [af_heart│ │
│  │                                    │  │          │ │
│  │  ⌘↵ generate             120/400   │  │ Speed    │ │
│  └────────────────────────────────────┘  │ ──●── 1.0×│ │
│  ( ▶ ──────●──── 0:00 / 3:45      ⤓ )   │          │ │
│                                          │ [Generate]│ │
│                                          └──────────┘ │
└──────────────────────────────────────────────────────┘
```

The editor card flexes to fill the left column up to ~280px (400 characters never need more) with the character counter in its footer; the audio pill is always visible below it and stays disabled until a clip exists. The right rail is a fixed 248px column with Generate pinned to the bottom; New is an icon in the toolbar. History slides in from the right; Settings opens as a centered two-pane sheet (Defaults / Saving / About). `Esc` closes either; `⌘,` opens Settings. Non-blocking errors surface in a dismissible banner under the toolbar.

Shortcuts and workspace actions: **New** (`⌘N`, toolbar icon) is the single reset action — it clears the text and discards the current clip for a clean slate. Settings changes save automatically (debounced) as they're made; **Reset** restores defaults, persists, and flashes "Reset ✓".

## Project Structure

```
Sonora/
├── src/
│   ├── index.tsx
│   ├── index.css              # @import tailwindcss + Manrope, light/dark semantic tokens
│   ├── App.tsx                # root: composes all components, owns shared state
│   ├── lib/
│   │   ├── types.ts           # SynthResult / HistoryEntry / Settings
│   │   ├── audio.ts           # base64 → bytes → blob URL helpers
│   │   ├── format.ts          # recording names, relative timestamps, media durations
│   │   └── constants.ts       # MAX_TEXT_CHARS
│   └── components/
│       ├── Toolbar.tsx
│       ├── Sheet.tsx
│       ├── SlideOver.tsx
│       ├── ControlRail.tsx
│       ├── VoiceSelector.tsx
│       ├── TextInput.tsx
│       ├── SpeedControl.tsx
│       ├── GenerateButton.tsx
│       ├── AudioPlayer.tsx
│       ├── SaveButton.tsx
│       ├── HistoryPanel.tsx
│       ├── SettingsPanel.tsx
│       └── icons.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs             # Tauri setup, init KokoroTts as state
│   │   ├── commands.rs        # voices, synth, history, save, settings commands
│   │   └── settings.rs        # Settings load/save (app data dir)
│   ├── resources/
│   │   ├── model.onnx         # fp32 (~325 MB, downloaded)
│   │   └── voices/            # all 55 *.bin voice files (downloaded)
│   ├── Cargo.toml             # +kokoro-en, base64, hound, tauri-plugin-dialog, tauri-plugin-opener
│   ├── tauri.conf.json
│   └── tauri.linux.conf.json  # Linux window + bundle overrides (merged on Linux)
├── scripts/
│   └── download-models.sh     # dynamically fetches model + 55 voices from HF API
├── package.json               # +@tauri-apps/plugin-dialog, plugin-opener, @fontsource-variable/manrope
├── vite.config.ts
├── tsconfig.json
├── .gitignore
└── AGENTS.md
```

## Data Flow

1. App starts → Rust `setup()` initializes `KokoroTts` with model + voices paths
2. Frontend loads `list_voices` + `get_settings` in parallel, then `get_history`
3. User selects voice/speed, enters text, clicks Generate
4. Frontend calls `synth(text, voice, speed)` → Rust runs `tts.synth()`, encodes WAV, **persists it to history**, and returns base64 WAV + the new `HistoryEntry`
5. Frontend decodes base64 into `Uint8Array`, creates a `Blob` → sets `<audio>` src as a blob URL (previous URL is revoked on replace)
6. User clicks Save → frontend sends raw `Uint8Array` to `save_audio()` → Rust opens OS dialog → writes WAV to disk
7. Voice/speed changes and new selections revoke the current blob URL; history playback uses the same revoke-on-replace lifecycle

## Model Setup

Model files from [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX):

- `onnx/model.onnx` → full precision fp32 (~325 MB)
- `voices/*.bin` → all voice packs (~55 voices)

Run `scripts/download-models.sh` after cloning to fetch them. The script uses the Hugging Face API to discover available voice files dynamically.

Files under `src-tauri/resources/` are gitignored — must be downloaded locally.

**ONNX Runtime / Linux build floor.** `kokoro-en` pulls in `ort`/`ort-sys`, which downloads a prebuilt ONNX Runtime at build time and statically links it. `kokoro-en` unconditionally enables ort's `cuda`, `directml`, `coreml`, and `lax-feature-matching` features — Cargo features are additive, so downstream crates cannot turn them off — so on Linux ort-sys selects the `cuda13,tensorrt,nvrtx` dist. That prebuilt is compiled against **glibc ≥ 2.38** and **libstdc++ ≥ GCC 12**, which means Linux builds must run on **Ubuntu 24.04+** and the produced binaries require **glibc ≥ 2.38** at runtime. Building on Ubuntu 22.04 fails at link time with undefined `__isoc23_strto*` and `std::__cxx11::basic_string::_M_replace_cold` symbols.

## Commands

```sh
bun install
./scripts/download-models.sh
bun tauri dev
```

Build release bundles: `bun tauri build --bundles app` on macOS, or
`bun tauri build --bundles deb,rpm,appimage` on Linux (x86_64; needs CMake for
espeak-ng plus the WebKitGTK/patchelf/libfuse2 system packages). GitHub Actions
workflows `build-macos.yml` and `build-linux.yml` publish both, and are triggered
manually with a release tag.
