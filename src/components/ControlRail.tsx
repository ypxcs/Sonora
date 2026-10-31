import VoiceSelector from "./VoiceSelector";
import SpeedControl from "./SpeedControl";
import GenerateButton from "./GenerateButton";

interface Props {
  voices: string[];
  voice: string;
  onVoiceChange: (v: string) => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  onGenerate: () => void;
  loading: boolean;
  canGenerate: boolean;
}

/** Right-hand control column: synthesis options on top, Generate pinned to
 *  the bottom. The editor owns the rest of the window. */
function ControlRail(props: Props) {
  return (
    <aside class="flex w-[248px] shrink-0 flex-col gap-4">
      <VoiceSelector
        voices={props.voices}
        value={props.voice}
        onChange={props.onVoiceChange}
      />
      <SpeedControl value={props.speed} onChange={props.onSpeedChange} />
      <div class="mt-auto">
        <GenerateButton
          onClick={props.onGenerate}
          loading={props.loading}
          disabled={!props.canGenerate}
        />
      </div>
    </aside>
  );
}

export default ControlRail;
