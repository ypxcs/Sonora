import { Show, type JSX } from "solid-js";
import { formatShortcut, isMacOS } from "../lib/platform";
import { IconHistory, IconNew, IconSettings } from "./icons";

interface Props {
  historyActive: boolean;
  settingsActive: boolean;
  canNew: boolean;
  onNew: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

function ToolbarButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`flex h-7 w-7 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-[var(--control-hover)] hover:text-content disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-content-secondary ${
        props.active ? "bg-[var(--control-active)] text-content" : ""
      }`}
    >
      {props.children}
    </button>
  );
}

function Toolbar(props: Props) {
  return (
    <header
      data-tauri-drag-region="deep"
      class="flex h-11 shrink-0 items-center border-b border-separator bg-[var(--surface-translucent)] backdrop-blur-xl"
    >
      {/* On macOS the traffic lights overlay the content, so reserve space for
          them; elsewhere the OS title bar already shows the app name. */}
      <div
        class={`flex flex-1 items-center ${isMacOS() ? "pl-[76px]" : "pl-3"}`}
      />
      <Show when={isMacOS()}>
        <div class="shrink-0 text-center text-[13px] font-semibold text-content-secondary">
          Sonora
        </div>
      </Show>
      {/* Symmetric flex-1 zones keep the title centered when it's shown. */}
      <div class="flex flex-1 items-center justify-end gap-2 pr-3">
        <ToolbarButton
          label={`New (${formatShortcut("N")})`}
          disabled={!props.canNew}
          onClick={props.onNew}
        >
          <IconNew class="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="History"
          active={props.historyActive}
          onClick={props.onOpenHistory}
        >
          <IconHistory class="h-4 w-4" />
        </ToolbarButton>
        <div class="h-5 w-px bg-separator" />
        <ToolbarButton
          label="Settings"
          active={props.settingsActive}
          onClick={props.onOpenSettings}
        >
          <IconSettings class="h-4 w-4" />
        </ToolbarButton>
      </div>
    </header>
  );
}

export default Toolbar;
