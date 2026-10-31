import {
  createSignal,
  createEffect,
  createMemo,
  createUniqueId,
  For,
  Show,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { IconChevronDown } from "./icons";

function groupPrefix(v: string): string {
  const i = v.indexOf("_");
  return i > 0 ? v.slice(0, i) : "other";
}

function voiceGroups(voices: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const v of voices) {
    const key = groupPrefix(v);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

interface Props {
  voices: string[];
  value: string;
  onChange: (v: string) => void;
  /** Hide the built-in label when a surrounding Field already provides one. */
  label?: string | null;
  /** Offer a "None (first)" choice that reports an empty string. */
  allowNone?: boolean;
}

function VoiceSelector(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [menuStyle, setMenuStyle] = createSignal<JSX.CSSProperties>({});
  const listId = createUniqueId();
  let ref: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const noneVisible = () => !!props.allowNone && !query().trim();

  // Group matches for display, tracking each group's offset so the active
  // keyboard index maps onto the flattened option list.
  const grouped = createMemo(() => {
    const q = query().toLowerCase();
    const groups: [string, string[]][] = !q
      ? voiceGroups(props.voices)
      : (() => {
          const matching = props.voices.filter((v) =>
            v.toLowerCase().includes(q),
          );
          return matching.length ? [["", matching] as [string, string[]]] : [];
        })();

    let start = 0;
    return groups.map(([group, items]) => {
      const g = { group, items, start };
      start += items.length;
      return g;
    });
  });

  // None (when offered) sits before the grouped voices and shares the same
  // keyboard cursor.
  const flat = createMemo(() => {
    const voices = grouped().flatMap((g) => g.items);
    return noneVisible() ? ["", ...voices] : voices;
  });

  const offset = () => (noneVisible() ? 1 : 0);

  function initialIndex() {
    const i = flat().indexOf(props.value);
    return i >= 0 ? i : 0;
  }

  /** Fixed positioning keeps the menu above the Settings sheet's scroll pane. */
  function positionMenu() {
    const el = ref;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const margin = 12;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const openUp = below < 200 && above > below;
    setMenuStyle({
      left: `${r.left}px`,
      width: `${r.width}px`,
      top: openUp ? undefined : `${r.bottom + gap}px`,
      bottom: openUp ? `${window.innerHeight - r.top + gap}px` : undefined,
      "max-height": `${Math.max(140, Math.min(288, openUp ? above : below))}px`,
    });
  }

  function openMenu() {
    positionMenu();
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  createEffect(() => {
    if (!open()) {
      setQuery("");
      return;
    }
    setActiveIndex(initialIndex());
    inputRef?.focus();
    positionMenu();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref?.contains(target) || menuRef?.contains(target)) return;
      closeMenu();
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node;
      if (ref?.contains(target) || menuRef?.contains(target)) return;
      closeMenu();
    };
    const reposition = () => positionMenu();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  });

  // Reset the keyboard cursor when the search changes.
  createEffect(() => {
    query();
    setActiveIndex(0);
  });

  // Keep the highlighted option visible during keyboard navigation.
  createEffect(() => {
    if (!open()) return;
    const idx = activeIndex();
    menuRef
      ?.querySelector<HTMLElement>(`[data-index="${idx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  function select(v: string) {
    props.onChange(v);
    closeMenu();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      // Keep Escape from also closing the Settings sheet.
      e.stopPropagation();
      closeMenu();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open()) {
        openMenu();
        return;
      }
      const options = flat();
      if (options.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const next = i + delta;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      if (!open()) {
        openMenu();
        return;
      }
      e.preventDefault();
      const v = flat()[activeIndex()];
      if (v !== undefined) select(v);
    }
  }

  return (
    <div class="flex w-full flex-col gap-1.5">
      <Show when={props.label !== null}>
        <label class="text-[11px] font-medium text-content-secondary">
          {props.label ?? "Voice"}
        </label>
      </Show>
      <div
        ref={ref}
        tabIndex={0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={listId}
        onKeyDown={handleKeyDown}
        class="relative w-full cursor-pointer"
      >
        <div
          onClick={() => (open() ? closeMenu() : openMenu())}
          class="flex h-8 items-center justify-between gap-2 rounded-md border border-[var(--control-border)] bg-[var(--control)] px-2.5 text-[13px]"
        >
          <span
            class={`min-w-0 flex-1 truncate ${
              props.value || props.allowNone
                ? "text-content"
                : "text-content-tertiary"
            }`}
          >
            {props.value ||
              (props.allowNone
                ? "None (first)"
                : `Select a voice (${props.voices.length})...`)}
          </span>
          <IconChevronDown
            class={`h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform ${open() ? "rotate-180" : ""}`}
          />
        </div>
        <Show when={open()}>
          <Portal>
            <div
              ref={menuRef}
              style={menuStyle()}
              onKeyDown={handleKeyDown}
              class="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-separator bg-surface-elevated shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
            >
              <div class="shrink-0 border-b border-separator p-1.5">
                <input
                  ref={inputRef}
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  placeholder="Search voices..."
                  class="w-full rounded-md border border-[var(--control-border)] bg-[var(--editor)] px-2 py-1.5 text-[13px] text-content placeholder:text-content-tertiary focus:border-[var(--focus-border)] focus:outline-none"
                />
              </div>
              <ul
                id={listId}
                role="listbox"
                class="min-h-0 flex-1 overflow-y-auto py-1"
              >
                <Show when={noneVisible()}>
                  <li
                    role="option"
                    aria-selected={props.value === ""}
                    data-index={0}
                    onMouseEnter={() => setActiveIndex(0)}
                    onClick={() => select("")}
                    class={`cursor-pointer border-b border-separator px-2.5 py-1.5 text-[13px] ${
                      activeIndex() === 0
                        ? "bg-[var(--control-active)]"
                        : "hover:bg-[var(--control-hover)]"
                    } ${props.value === "" ? "text-accent" : "text-content"}`}
                  >
                    None (first)
                  </li>
                </Show>
                {grouped().length === 0 && !noneVisible() ? (
                  <li class="px-2.5 py-1.5 text-[13px] text-content-tertiary">
                    No matches
                  </li>
                ) : (
                  <For each={grouped()}>
                    {(g) => (
                      <>
                        {g.group && (
                          <li class="sticky top-0 z-10 border-b border-separator bg-surface-elevated px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                            {g.group}
                          </li>
                        )}
                        <For each={g.items}>
                          {(v, i) => {
                            const index = () => offset() + g.start + i();
                            const active = () => index() === activeIndex();
                            return (
                              <li
                                role="option"
                                aria-selected={v === props.value}
                                data-index={index()}
                                onMouseEnter={() => setActiveIndex(index())}
                                onClick={() => select(v)}
                                class={`cursor-pointer border-b border-separator px-2.5 py-1.5 text-[13px] last:border-b-0 ${
                                  active()
                                    ? "bg-[var(--control-active)]"
                                    : "hover:bg-[var(--control-hover)]"
                                } ${v === props.value ? "text-accent" : "text-content"}`}
                              >
                                {v}
                              </li>
                            );
                          }}
                        </For>
                      </>
                    )}
                  </For>
                )}
              </ul>
            </div>
          </Portal>
        </Show>
      </div>
    </div>
  );
}

export default VoiceSelector;
