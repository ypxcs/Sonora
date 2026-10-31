import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import Toolbar from "./components/Toolbar";
import TextInput from "./components/TextInput";
import ControlRail from "./components/ControlRail";
import AudioPlayer from "./components/AudioPlayer";
import SaveButton from "./components/SaveButton";
import HistoryPanel from "./components/HistoryPanel";
import SettingsPanel from "./components/SettingsPanel";
import Sheet from "./components/Sheet";
import SlideOver from "./components/SlideOver";
import { toWavBytes, createWavUrl } from "./lib/audio";
import type {
  SynthSaveResult,
  SynthResult,
  HistoryEntry,
  Settings,
} from "./lib/types";

type Overlay = "none" | "history" | "settings";

const VOICE_STORAGE_KEY = "sonora_voice";
/** Pre-rename key, still read as a fallback so an existing saved voice survives the rename. */
const LEGACY_VOICE_STORAGE_KEY = "kokorou_voice";

function App() {
  const [voices, setVoices] = createSignal<string[]>([]);
  const [selectedVoice, setSelectedVoice] = createSignal("");
  const [text, setText] = createSignal("");
  const [audioUrl, setAudioUrl] = createSignal<string | null>(null);
  const [wavBytes, setWavBytes] = createSignal<Uint8Array | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [overlay, setOverlay] = createSignal<Overlay>("none");
  const [history, setHistory] = createSignal<HistoryEntry[]>([]);
  const [refocusKey, setRefocusKey] = createSignal(0);
  const [speed, setSpeed] = createSignal(1.0);
  const [settings, setSettings] = createSignal<Settings | null>(null);

  /** Replace the current audio, revoking the previous object URL. */
  function setAudioFromBytes(bytes: Uint8Array<ArrayBuffer>) {
    revokeAudio();
    setWavBytes(bytes);
    setAudioUrl(createWavUrl(bytes));
  }

  /** Drop the current audio and release its object URL. */
  function revokeAudio() {
    const url = audioUrl();
    if (url) URL.revokeObjectURL(url);
    setAudioUrl(null);
    setWavBytes(null);
  }

  onCleanup(revokeAudio);

  function handleVoiceChange(v: string) {
    setSelectedVoice(v);
    revokeAudio();
    localStorage.setItem(VOICE_STORAGE_KEY, v);
  }

  function handleSpeedChange(v: number) {
    setSpeed(v);
    revokeAudio();
  }

  function handleSettingsChange(s: Settings) {
    setSettings(s);
    setSpeed(s.default_speed);
    if (s.default_voice && voices().includes(s.default_voice)) {
      setSelectedVoice(s.default_voice);
    }
  }

  function openOverlay(o: Overlay) {
    setOverlay((cur) => (cur === o ? "none" : o));
  }

  function closeOverlay() {
    if (overlay() === "none") return;
    setOverlay("none");
    setRefocusKey((k) => k + 1);
  }

  /** Return to a clean slate: clear the text and discard the current clip. */
  function handleNewWorkspace() {
    setText("");
    revokeAudio();
    setError(null);
    setRefocusKey((k) => k + 1);
  }

  const canNew = () => text().length > 0 || audioUrl() !== null;

  async function loadHistory() {
    try {
      setHistory(await invoke<HistoryEntry[]>("get_history"));
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadInitial() {
    try {
      const [v, s] = await Promise.all([
        invoke<string[]>("list_voices"),
        invoke<Settings>("get_settings"),
      ]);
      setVoices(v);
      setSettings(s);
      setSpeed(s.default_speed);

      const savedVoice =
        s.default_voice ||
        localStorage.getItem(VOICE_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_VOICE_STORAGE_KEY);
      if (savedVoice && v.includes(savedVoice)) {
        setSelectedVoice(savedVoice);
      } else if (v.length > 0) {
        setSelectedVoice(v[0]);
      }
    } catch (e) {
      setError(String(e));
    }
    loadHistory();
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOverlay();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setOverlay("settings");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewWorkspace();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
    void loadInitial();
  });

  async function handleGenerate() {
    if (!text().trim() || !selectedVoice()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SynthSaveResult>("synth", {
        text: text(),
        voice: selectedVoice(),
        speed: speed(),
      });
      setAudioFromBytes(toWavBytes(result));
      // `synth` persists history server-side, so no extra round-trip is needed.
      setHistory((prev) => [result.entry, ...prev]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleHistorySelect(entry: HistoryEntry) {
    setText(entry.text);
    setSelectedVoice(entry.voice);
    setOverlay("none");
    loadHistoryAudio(entry.id);
    setRefocusKey((k) => k + 1);
  }

  async function loadHistoryAudio(id: string) {
    try {
      const result = await invoke<SynthResult>("load_history_audio", { id });
      setAudioFromBytes(toWavBytes(result));
    } catch (e) {
      setError(String(e));
    }
  }

  function handleHistoryDelete(id: string) {
    setHistory((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleClearAll() {
    try {
      await invoke("clear_history");
      setHistory([]);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div class="flex h-screen flex-col bg-surface text-content">
      <Toolbar
        historyActive={overlay() === "history"}
        settingsActive={overlay() === "settings"}
        canNew={canNew()}
        onNew={handleNewWorkspace}
        onOpenHistory={() => openOverlay("history")}
        onOpenSettings={() => openOverlay("settings")}
      />

      <Show when={error()}>
        <div class="flex items-start justify-between gap-3 bg-[var(--danger-bg)] px-4 py-2">
          <p class="min-w-0 flex-1 break-words text-[12px] text-danger">
            {error()}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            title="Dismiss"
            class="shrink-0 text-[12px] text-danger transition-opacity hover:opacity-70"
          >
            ✕
          </button>
        </div>
      </Show>

      <main class="flex min-h-0 flex-1 gap-5 px-5 pt-4 pb-3">
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <TextInput
            value={text()}
            onChange={setText}
            onSubmit={handleGenerate}
            refocusKey={refocusKey()}
          />

          <div class="mt-auto flex shrink-0 items-center gap-2 rounded-full border border-separator bg-[var(--control)] py-1.5 pl-1.5 pr-2">
            <AudioPlayer src={audioUrl()} />
            <SaveButton wavBytes={wavBytes()} compact />
          </div>
        </div>

        <ControlRail
          voices={voices()}
          voice={selectedVoice()}
          onVoiceChange={handleVoiceChange}
          speed={speed()}
          onSpeedChange={handleSpeedChange}
          onGenerate={handleGenerate}
          loading={loading()}
          canGenerate={text().trim().length > 0 && selectedVoice().length > 0}
        />
      </main>

      <Show when={overlay() === "history"}>
        <SlideOver
          title={`History (${history().length})`}
          onClose={closeOverlay}
        >
          <HistoryPanel
            entries={history()}
            onSelect={handleHistorySelect}
            onDelete={handleHistoryDelete}
            onClearAll={handleClearAll}
            onError={setError}
          />
        </SlideOver>
      </Show>

      <Show when={overlay() === "settings"}>
        <Sheet
          title="Settings"
          onClose={closeOverlay}
          widthClass="w-[620px]"
          bodyClass="flex min-h-0 flex-1 overflow-hidden p-0"
        >
          <SettingsPanel
            voices={voices()}
            settings={settings()}
            onSettingsChange={handleSettingsChange}
            onError={setError}
          />
        </Sheet>
      </Show>
    </div>
  );
}

export default App;
