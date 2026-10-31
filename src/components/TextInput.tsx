import { createSignal, createEffect } from "solid-js";
import { MAX_TEXT_CHARS } from "../lib/constants";
import { formatShortcut } from "../lib/platform";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  refocusKey?: number;
}

function TextInput(props: Props) {
  let ref: HTMLTextAreaElement | undefined;
  const [dragging, setDragging] = createSignal(false);

  createEffect(() => {
    if (props.refocusKey) ref?.focus();
  });

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      props.onSubmit?.();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = ref;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      el.value = val.slice(0, start) + "\t" + val.slice(end);
      el.selectionStart = el.selectionEnd = start + 1;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    // Required so the browser allows the drop.
    e.preventDefault();
    setDragging(true);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      props.onChange(text.slice(0, MAX_TEXT_CHARS));
    };
    reader.readAsText(file);
  }

  const atLimit = () => props.value.length >= MAX_TEXT_CHARS;

  return (
    // Fills the left column up to 280px: 400 characters never need more, and
    // the counter lives in the card's footer so it reads as part of the editor.
    <div class="relative flex min-h-[160px] max-h-[280px] flex-1 flex-col rounded-lg border border-separator bg-[var(--editor)] transition-colors focus-within:border-[var(--focus-border)]">
      <textarea
        ref={ref}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        placeholder="Enter text to speak... (or drop a .txt file)"
        maxLength={MAX_TEXT_CHARS}
        class="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent p-3.5 text-[13px] leading-relaxed text-content placeholder:text-content-tertiary focus:outline-none"
      />
      <div class="flex shrink-0 items-center justify-between gap-3 border-t border-separator px-3 py-1.5 text-[11px]">
        <span class="truncate text-content-tertiary">
          {dragging()
            ? "Drop .txt to load"
            : `Drop a .txt or press ${formatShortcut("↵")} to generate`}
        </span>
        <span
          class={`shrink-0 tabular-nums ${
            atLimit() ? "text-danger" : "text-content-tertiary"
          }`}
        >
          {props.value.length}/{MAX_TEXT_CHARS}
        </span>
      </div>
      {dragging() && (
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--focus-border)] bg-[var(--surface-translucent)] backdrop-blur-sm">
          <span class="text-[13px] font-medium text-content-secondary">
            Drop .txt to load
          </span>
        </div>
      )}
    </div>
  );
}

export default TextInput;
