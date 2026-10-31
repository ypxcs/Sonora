import { invoke } from "@tauri-apps/api/core";
import { Show } from "solid-js";
import { recordingName } from "../lib/format";
import { IconDownload } from "./icons";

interface Props {
  /** Null until a clip exists; the button is disabled in that state. */
  wavBytes: Uint8Array | null;
  /** Icon-only variant for the audio pill. */
  compact?: boolean;
}

function SaveButton(props: Props) {
  const disabled = () => !props.wavBytes;

  async function handleSave() {
    if (disabled()) return;
    try {
      await invoke("save_audio", {
        data: Array.from(props.wavBytes!),
        defaultName: recordingName(),
      });
    } catch (e) {
      if (e !== "Cancelled") console.error(e);
    }
  }

  return (
    <Show
      when={!props.compact}
      fallback={
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled()}
          aria-label="Save"
          title="Save WAV"
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors hover:bg-[var(--control-hover)] hover:text-content disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-content-secondary"
        >
          <IconDownload class="h-4 w-4" />
        </button>
      }
    >
      <button
        type="button"
        onClick={handleSave}
        disabled={disabled()}
        class="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--control-border)] bg-[var(--control)] px-3 text-[13px] font-medium text-content transition-colors hover:bg-[var(--control-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconDownload class="h-4 w-4" />
        Save
      </button>
    </Show>
  );
}

export default SaveButton;
