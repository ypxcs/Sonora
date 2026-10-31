import { createSignal, createEffect } from "solid-js";
import { formatDuration } from "../lib/format";
import { IconPause, IconPlay } from "./icons";

interface Props {
  /** Null until a clip exists; the pill stays visible but disabled. */
  src: string | null;
}

function AudioPlayer(props: Props) {
  let ref: HTMLAudioElement | undefined;
  const [playing, setPlaying] = createSignal(false);
  const [duration, setDuration] = createSignal(0);
  const [current, setCurrent] = createSignal(0);
  /** True while the seek slider is being dragged, so `timeupdate` events
   * don't yank the knob back to the playback position mid-drag. */
  let seeking = false;

  const hasAudio = () => !!props.src;

  // A fresh blob URL replaces the old clip; resync the UI to its start.
  createEffect(() => {
    props.src;
    ref?.pause();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  });

  function toggle() {
    const el = ref;
    if (!el || !hasAudio()) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  function seek(v: number) {
    setCurrent(v);
    if (ref) ref.currentTime = v;
  }

  // The pill container is owned by the caller; these controls sit inside it.
  return (
    <>
      <audio
        ref={ref}
        src={props.src ?? undefined}
        preload="auto"
        class="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => {
          if (!seeking && ref) setCurrent(ref.currentTime);
        }}
        onLoadedMetadata={() => {
          if (ref) setDuration(ref.duration || 0);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={!hasAudio()}
        aria-label={playing() ? "Pause" : "Play"}
        title={playing() ? "Pause" : "Play"}
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-default disabled:bg-[var(--control-border)] disabled:text-content-tertiary disabled:hover:bg-[var(--control-border)]"
      >
        {playing() ? (
          <IconPause class="h-4 w-4" />
        ) : (
          <IconPlay class="h-4 w-4" />
        )}
      </button>
      <input
        type="range"
        min="0"
        max={duration()}
        step="0.01"
        value={current()}
        disabled={!hasAudio() || !duration()}
        aria-label="Seek"
        onPointerDown={() => (seeking = true)}
        onPointerUp={() => (seeking = false)}
        onKeyDown={() => (seeking = false)}
        onChange={() => (seeking = false)}
        onInput={(e) => seek(parseFloat(e.currentTarget.value))}
        class="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--control-border)] accent-[var(--accent)] disabled:cursor-default disabled:opacity-50"
      />
      <span
        class={`shrink-0 whitespace-nowrap text-[11px] tabular-nums ${
          hasAudio() ? "text-content-secondary" : "text-content-tertiary"
        }`}
      >
        {formatDuration(current())} / {formatDuration(duration())}
      </span>
    </>
  );
}

export default AudioPlayer;
