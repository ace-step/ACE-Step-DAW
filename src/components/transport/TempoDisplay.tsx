import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { getTempoAtBeat, timeToBeat, getTimeSignatureAtBar, getBarAtBeat } from '../../utils/tempoMap';

export function TempoDisplay() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useTransportStore((s) => s.currentTime);

  if (!project) return null;

  const { bpm, tempoMap, timeSignature, timeSignatureMap } = project;

  // Show current tempo at playhead position (accounts for tempo map)
  const currentBeat = timeToBeat(currentTime, tempoMap, bpm);
  const currentBpm = Math.round(getTempoAtBeat(tempoMap, currentBeat, bpm));

  // Show current time signature at playhead
  const currentBar = getBarAtBeat(Math.floor(currentBeat), timeSignatureMap, timeSignature);
  const currentTs = getTimeSignatureAtBar(timeSignatureMap, currentBar, timeSignature, 4);

  const hasTempoMap = tempoMap && tempoMap.length > 0;

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="font-medium text-zinc-300">
        {currentBpm} BPM
        {hasTempoMap && currentBpm !== bpm && (
          <span className="text-amber-400/60 ml-0.5" title={`Project default: ${bpm} BPM`}>*</span>
        )}
      </span>
      <span>{project.keyScale}</span>
      <span>{currentTs.numerator}/{currentTs.denominator}</span>
    </div>
  );
}
