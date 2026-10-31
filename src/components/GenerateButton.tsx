import { formatShortcut } from "../lib/platform";
import { IconSpeaker } from "./icons";

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}

function GenerateButton(props: Props) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      title={`Generate (${formatShortcut("↵")})`}
      class="flex h-8 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.loading ? (
        <svg
          class="h-3.5 w-3.5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <IconSpeaker class="h-4 w-4" />
      )}
      Generate
    </button>
  );
}

export default GenerateButton;
