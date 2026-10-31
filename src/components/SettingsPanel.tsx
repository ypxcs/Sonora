import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
  type JSX,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppInfo, Settings } from "../lib/types";
import { IconClose, IconReset } from "./icons";
import VoiceSelector from "./VoiceSelector";

interface Props {
  voices: string[];
  settings: Settings | null;
  onSettingsChange: (s: Settings) => void;
  onError?: (message: string) => void;
}

const DEFAULTS: Settings = {
  default_voice: null,
  default_speed: 1.0,
  audio_format: "wav",
  default_directory: null,
  last_save_directory: null,
};

const FORMATS = [{ value: "wav", label: "WAV" }];

const SECTIONS = [
  { id: "defaults", label: "Defaults" },
  { id: "saving", label: "Saving" },
  { id: "about", label: "About" },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

const fieldClass =
  "rounded-md border border-[var(--control-border)] bg-[var(--control)] px-2 py-1 text-[13px] text-content";

function Field(props: {
  label: string;
  hint?: string;
  children: JSX.Element;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex flex-col gap-0.5">
        <span class="text-[12px] font-medium text-content">{props.label}</span>
        <Show when={props.hint}>
          <span class="text-[11px] text-content-tertiary">{props.hint}</span>
        </Show>
      </div>
      {props.children}
    </div>
  );
}

function SettingsPanel(props: Props) {
  const [draft, setDraft] = createSignal<Settings>(DEFAULTS);
  const [resetting, setResetting] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [section, setSection] = createSignal<Section>("defaults");
  /** Where saves actually go when no override is set (last saved dir → home),
   *  resolved by the backend — the webview can't know either. */
  const [defaultDir, setDefaultDir] = createSignal<string | null>(null);
  const [appInfo, setAppInfo] = createSignal<AppInfo | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: Settings | null = null;
  // Serialize writes so a slow save can never overwrite a newer one.
  let writeQueue: Promise<void> = Promise.resolve();

  onCleanup(() => {
    clearTimeout(saveTimer);
    clearTimeout(noticeTimer);
    // Flush a change made just before the sheet closed.
    const queued = pending;
    pending = null;
    if (queued) write(queued);
  });

  // Seed the draft once. Auto-save updates `props.settings`, which must not
  // overwrite a newer local edit while the user is still adjusting a control.
  let seeded = false;
  createEffect(() => {
    const s = props.settings;
    if (s && !seeded) {
      setDraft(s);
      seeded = true;
    }
  });

  // The panel remounts on every open, so this stays fresh after each save.
  onMount(async () => {
    try {
      setDefaultDir(await invoke<string | null>("get_save_directory"));
    } catch (e) {
      props.onError?.(String(e));
    }
    try {
      setAppInfo(await invoke<AppInfo>("get_app_info"));
    } catch (e) {
      props.onError?.(String(e));
    }
  });

  function enqueue(next: Settings): Promise<boolean> {
    const run = writeQueue.then(async () => {
      try {
        await invoke("save_settings", { settings: next });
        props.onSettingsChange(next);
        return true;
      } catch (e) {
        props.onError?.(String(e));
        return false;
      }
    });
    writeQueue = run.then(() => undefined);
    return run;
  }

  function write(next: Settings) {
    void enqueue(next);
  }

  /** Coalesce rapid changes (e.g. dragging the speed slider) into one write. */
  function scheduleSave(next: Settings) {
    pending = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      const queued = pending;
      pending = null;
      if (queued) write(queued);
    }, 250);
  }

  function update(partial: Partial<Settings>) {
    const next = { ...draft(), ...partial };
    setDraft(next);
    scheduleSave(next);
  }

  async function reset() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    pending = null;
    // Reset user choices but keep the backend-owned memory of the last save
    // location — that isn't a user setting.
    const next: Settings = {
      ...DEFAULTS,
      last_save_directory: props.settings?.last_save_directory ?? null,
    };
    setDraft(next);
    setResetting(true);
    // Queue behind any in-flight auto-save so the reset is the final write.
    const ok = await enqueue(next);
    if (ok) {
      setNotice("Reset");
      noticeTimer = setTimeout(() => setNotice(null), 1200);
    }
    setResetting(false);
  }

  /** Path shown in the field: the pending override, else the backend-resolved default. */
  const shownDir = () => draft().default_directory ?? defaultDir();

  async function pickDirectory() {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Choose default save location",
    });
    if (dir) update({ default_directory: dir });
  }

  return (
    <div class="flex min-h-[300px] w-full flex-col">
      <div class="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          class="w-[172px] shrink-0 border-r border-separator p-2"
        >
          <For each={SECTIONS}>
            {(s) => (
              <button
                type="button"
                onClick={() => setSection(s.id)}
                aria-pressed={section() === s.id}
                class={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
                  section() === s.id
                    ? "bg-[var(--control-active)] text-content"
                    : "text-content-secondary hover:bg-[var(--control-hover)] hover:text-content"
                }`}
              >
                {s.label}
              </button>
            )}
          </For>
        </nav>

        <div class="min-w-0 flex-1 overflow-y-auto p-5">
          <Show when={section() === "defaults"}>
            <div class="flex flex-col gap-4">
              <Field
                label="Default voice"
                hint="Selected when the app opens."
              >
                <VoiceSelector
                  label={null}
                  allowNone
                  voices={props.voices}
                  value={draft().default_voice ?? ""}
                  onChange={(v) => update({ default_voice: v || null })}
                />
              </Field>

              <Field label="Default speed" hint="Speaking rate for new clips.">
                <div class="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={draft().default_speed}
                    onInput={(e) =>
                      update({
                        default_speed: parseFloat(e.currentTarget.value),
                      })
                    }
                    class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--control-border)] accent-[var(--accent)]"
                  />
                  <div class="flex items-center gap-1">
                    <span class="w-9 text-right text-[12px] tabular-nums text-content-secondary">
                      {draft().default_speed.toFixed(1)}×
                    </span>
                    <button
                      type="button"
                      onClick={() => update({ default_speed: 1.0 })}
                      disabled={draft().default_speed === 1.0}
                      title="Reset to 1.0×"
                      aria-label="Reset speed to 1.0×"
                      class="flex h-5 w-5 items-center justify-center rounded text-content-tertiary transition-colors hover:bg-[var(--control-hover)] hover:text-content disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <IconReset class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Field>
            </div>
          </Show>

          <Show when={section() === "saving"}>
            <div class="flex flex-col gap-4">
              <Field label="Format" hint="File type used when saving.">
                <select
                  value={draft().audio_format}
                  onChange={(e) =>
                    update({ audio_format: e.currentTarget.value })
                  }
                  class={`w-24 ${fieldClass}`}
                >
                  {FORMATS.map((f) => (
                    <option value={f.value}>{f.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Save to" hint="Where the save dialog starts.">
                <div class="flex min-w-0 items-center gap-1.5">
                  <span
                    class={`flex-1 truncate rounded-md border border-separator bg-[var(--editor)] px-2 py-1 text-[13px] ${
                      draft().default_directory
                        ? "text-content"
                        : "text-content-secondary"
                    }`}
                    title={shownDir() ?? undefined}
                  >
                    {shownDir() ?? "…"}
                  </span>
                  <button
                    type="button"
                    onClick={pickDirectory}
                    class="rounded-md border border-[var(--control-border)] px-2 py-1 text-[13px] font-medium text-content transition-colors hover:bg-[var(--control-hover)]"
                  >
                    Change
                  </button>
                  {draft().default_directory && (
                    <button
                      type="button"
                      onClick={() => update({ default_directory: null })}
                      aria-label="Clear"
                      title="Clear"
                      class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-content-tertiary transition-colors hover:bg-[var(--control-hover)] hover:text-content"
                    >
                      <IconClose class="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </Show>

          <Show when={section() === "about"}>
            <div class="flex flex-col gap-4">
              <Field label="Version">
                <span class="text-[13px] text-content">
                  {appInfo()?.version ?? "…"}
                </span>
              </Field>

              <Field
                label="Data location"
                hint="History and settings are stored here."
              >
                <span
                  class="block truncate rounded-md border border-separator bg-[var(--editor)] px-2 py-1 text-[13px] text-content-secondary"
                  title={appInfo()?.data_dir ?? undefined}
                >
                  {appInfo()?.data_dir ?? "…"}
                </span>
              </Field>
            </div>
          </Show>
        </div>
      </div>

      <div class="flex shrink-0 items-center justify-between gap-2 border-t border-separator px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-[11px] text-content-tertiary">
            Changes save automatically.
          </span>
          <Show when={notice()}>
            <span class="shrink-0 text-[11px] font-medium text-accent">
              {notice()} ✓
            </span>
          </Show>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={resetting()}
          class="shrink-0 rounded-md border border-[var(--control-border)] px-3 py-1 text-[13px] font-medium text-content-secondary transition-colors hover:bg-[var(--control-hover)] disabled:opacity-50"
        >
          {resetting() ? "Resetting…" : "Reset"}
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
