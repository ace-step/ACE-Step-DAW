import { useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { Knob } from '../ui/Knob';
import type { Track } from '../../types/project';
import { TRACK_CATALOG, TRACK_TYPE_CATALOG } from '../../constants/tracks';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium mb-1">{children}</div>
  );
}

function Divider() {
  return <div className="w-px h-16 bg-[#444] self-center" />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[11px] text-zinc-300 truncate">{value}</span>
    </div>
  );
}

/** Track-type-specific detail panel shown to the right of Volume/Pan. */
function TrackTypeDetails({ track }: { track: Track }) {
  const trackType = track.trackType ?? 'stems';
  const typeInfo = TRACK_TYPE_CATALOG[trackType];

  if (trackType === 'stems' || !track.trackType) {
    const clipCount = track.clips.length;
    const readyCount = track.clips.filter((c) => c.generationStatus === 'ready').length;
    return (
      <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
        <SectionLabel>Generation</SectionLabel>
        <InfoRow label="Type" value={typeInfo?.label ?? 'Stems'} />
        <InfoRow label="Clips" value={`${readyCount}/${clipCount} ready`} />
        {track.localCaption ? (
          <InfoRow label="Caption" value={track.localCaption} />
        ) : (
          <InfoRow label="Caption" value={track.trackName} />
        )}
      </div>
    );
  }

  if (trackType === 'sequencer') {
    const pattern = track.sequencerPattern;
    return (
      <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
        <SectionLabel>Sequencer</SectionLabel>
        <InfoRow label="Type" value={typeInfo?.label ?? 'Sequencer'} />
        {pattern ? (
          <>
            <InfoRow label="Pattern" value={pattern.name} />
            <InfoRow label="Rows" value={String(pattern.rows.length)} />
            <InfoRow label="Steps" value={`${pattern.stepsPerBar} x ${pattern.bars} bar${pattern.bars > 1 ? 's' : ''}`} />
            {pattern.swing > 0 && <InfoRow label="Swing" value={`${Math.round(pattern.swing * 100)}%`} />}
          </>
        ) : (
          <span className="text-[10px] text-zinc-500 italic">No pattern loaded</span>
        )}
      </div>
    );
  }

  if (trackType === 'pianoRoll') {
    return (
      <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
        <SectionLabel>Piano Roll</SectionLabel>
        <InfoRow label="Type" value={typeInfo?.label ?? 'Piano Roll'} />
        {track.synthPreset && <InfoRow label="Synth" value={track.synthPreset} />}
        {track.samplerConfig && <InfoRow label="Sampler" value={`Root: ${track.samplerConfig.rootNote}`} />}
        <InfoRow label="Clips" value={String(track.clips.length)} />
      </div>
    );
  }

  if (trackType === 'sample') {
    const clipCount = track.clips.length;
    const uploadedCount = track.clips.filter((c) => c.source === 'uploaded').length;
    return (
      <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
        <SectionLabel>Sample</SectionLabel>
        <InfoRow label="Type" value={typeInfo?.label ?? 'Sample'} />
        <InfoRow label="Clips" value={String(clipCount)} />
        {uploadedCount > 0 && <InfoRow label="Uploaded" value={String(uploadedCount)} />}
      </div>
    );
  }

  if (trackType === 'drumMachine') {
    return (
      <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
        <SectionLabel>Drum Machine</SectionLabel>
        <InfoRow label="Type" value={typeInfo?.label ?? 'Drum Machine'} />
        {track.drumKit && <InfoRow label="Kit" value={track.drumKit} />}
        {track.drumMachine && <InfoRow label="Pads" value={String(track.drumMachine.pads.length)} />}
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <SectionLabel>Track Info</SectionLabel>
      <InfoRow label="Type" value={trackType} />
      <InfoRow label="Clips" value={String(track.clips.length)} />
    </div>
  );
}

function TrackSmartControls({ track }: { track: Track }) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const info = TRACK_CATALOG[track.trackName];

  const vol = track.volume;
  const pan = track.pan ?? 0;
  const trackType = track.trackType ?? 'stems';

  return (
    <div className="flex items-start gap-6 px-4">
      {/* Track identity */}
      <div className="flex flex-col items-center gap-1 min-w-[80px]">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
          style={{ backgroundColor: track.color + '30', border: `2px solid ${track.color}40` }}
        >
          {info.emoji}
        </div>
        <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[80px]">{track.displayName}</span>
        <span className="text-[10px] text-zinc-400">{trackType}</span>
      </div>

      <Divider />

      {/* Volume & Pan — quick-access essentials */}
      <div className="flex flex-col items-center gap-1">
        <SectionLabel>Level</SectionLabel>
        <div className="flex gap-3">
          <Knob value={vol} min={0} max={1.5} defaultValue={1} onChange={(v) => updateTrack(track.id, { volume: v })} label="Volume" size={38} step={0.01} />
          <Knob value={pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { pan: v })} label="Pan" size={38} step={0.01} />
        </div>
      </div>

      <Divider />

      {/* Track-type-specific details */}
      <TrackTypeDetails track={track} />

      {/* Local caption editor for stems tracks */}
      {(trackType === 'stems') && (
        <>
          <Divider />
          <div className="flex flex-col gap-1 min-w-[160px] max-w-[240px]">
            <SectionLabel>Local Caption</SectionLabel>
            <textarea
              value={track.localCaption ?? ''}
              onChange={(e) => {
                const store = useProjectStore.getState();
                store.setTrackLocalCaption(track.id, e.target.value);
              }}
              placeholder={track.trackName}
              rows={3}
              className="text-[11px] text-zinc-300 bg-[#222] border border-[#444] rounded px-2 py-1 resize-none outline-none focus:border-daw-accent/60 placeholder:text-zinc-600"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function SmartControlsPanel() {
  const showSmartControls = useUIStore((s) => s.showSmartControls);
  const project = useProjectStore((s) => s.project);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);

  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const smartControlsHeight = 140;

  if (!showSmartControls || !project) return null;

  const selectedClipId = selectedClipIds.size === 1 ? [...selectedClipIds][0] : null;
  let selectedTrack: Track | null = null;

  if (selectedClipId) {
    for (const t of project.tracks) {
      if (t.clips.some(c => c.id === selectedClipId)) {
        selectedTrack = t;
        break;
      }
    }
  }

  if (!selectedTrack && project.tracks.length > 0) {
    selectedTrack = project.tracks[0];
  }

  return (
    <div
      className="border-t border-[#1a1a1a] bg-gradient-to-b from-[#2d2d2d] to-[#262626] shrink-0"
      style={{ height: smartControlsHeight }}
    >
      {/* Header bar */}
      <div className="flex items-center h-6 px-3 border-b border-[#3a3a3a] bg-[#333]">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Smart Controls</span>
        <span className="flex-1" />
        {selectedTrack && (
          <span className="text-[10px] text-zinc-400">{selectedTrack.displayName}</span>
        )}
      </div>

      {/* Controls area */}
      <div className="flex items-center justify-center h-[calc(100%-24px)] overflow-x-auto">
        {selectedTrack ? (
          <TrackSmartControls track={selectedTrack} />
        ) : (
          <span className="text-[11px] text-zinc-600">Select a track to view controls</span>
        )}
      </div>
    </div>
  );
}
