import type { JSX } from "solid-js";
import { IconClose } from "./icons";

interface Props {
  title: string;
  onClose: () => void;
  children: JSX.Element;
  /** Override the panel width (e.g. for the two-pane Settings sheet). */
  widthClass?: string;
  /** Override the body's padding/overflow when the content manages its own layout. */
  bodyClass?: string;
}

/** Modal sheet, e.g. the Settings surface. */
function Sheet(props: Props) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div
        class="animate-fade-in absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        class={`animate-fade-in relative z-10 flex max-h-[calc(100vh-3rem)] ${props.widthClass ?? "w-[420px]"} max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-separator bg-surface-elevated shadow-[0_24px_60px_rgba(0,0,0,0.35)]`}
      >
        <div class="flex shrink-0 items-center border-b border-separator px-4 py-2.5">
          <h2 class="flex-1 text-[13px] font-semibold text-content">{props.title}</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            class="flex h-6 w-6 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-[var(--control-hover)] hover:text-content"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class={`min-h-0 flex-1 ${props.bodyClass ?? "overflow-y-auto p-4"}`}>
          {props.children}
        </div>
      </div>
    </div>
  );
}

export default Sheet;
