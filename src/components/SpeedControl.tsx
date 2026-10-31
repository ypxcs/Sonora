import { IconReset } from "./icons";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

function SpeedControl(props: Props) {
  const atDefault = () => props.value === 1.0;

  return (
    <div class="flex w-full flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <label class="text-[11px] font-medium text-content-secondary">
          Speed
        </label>
        <div class="flex items-center gap-1">
          <span class="text-[11px] tabular-nums text-content-secondary">
            {props.value.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={() => props.onChange(1.0)}
            disabled={atDefault()}
            title="Reset to 1.0×"
            aria-label="Reset speed to 1.0×"
            class="flex h-5 w-5 items-center justify-center rounded text-content-tertiary transition-colors hover:bg-[var(--control-hover)] hover:text-content disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <IconReset class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min="0.5"
        max="2.0"
        step="0.1"
        value={props.value}
        onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--control-border)] accent-[var(--accent)]"
      />
    </div>
  );
}

export default SpeedControl;
