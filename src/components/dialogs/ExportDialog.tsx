import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { exportMixToWav, type ExportClip } from '../../engine/exportMix';
import { renderMidiTrackOffline, renderSequencerTrackOffline } from '../../engine/offlineRender';
import { toastError, toastSuccess } from '../../hooks/useToast';

export function ExportDialog() {
  const show = useUIStore((s) => s.showExportDialog);
  const setShow = useUIStore((s) => s.setShowExportDialog);
  const project = useProjectStore((s) => s.project);
  const [exporting, setExporting] = useState(false);

  if (!show || !project) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const engine = getAudioEngine();
      const clips: ExportClip[] = [];

      const anySoloed = project.tracks.some((t) => t.soloed);
      for (const track of project.tracks) {
        if (track.muted) continue;
        if (anySoloed && !track.soloed) continue;

        if (track.trackType === 'pianoRoll') {
          for (const clip of track.clips) {
            const notes = clip.midiData?.notes ?? [];
            if (notes.length === 0) continue;

            const buffer = await renderMidiTrackOffline(
              notes,
              clip.startTime,
              project.bpm,
              track.synthPreset ?? 'piano',
              project.totalDuration,
            );
            clips.push({ startTime: 0, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
          }
        }

        if (track.trackType === 'sequencer' && track.sequencerPattern) {
          const buffer = await renderSequencerTrackOffline(
            track.sequencerPattern,
            project.bpm,
            project.totalDuration,
            track.drumKit ?? '808',
          );
          clips.push({ startTime: 0, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
        }

        for (const clip of track.clips) {
          if (clip.generationStatus === 'ready' && clip.isolatedAudioKey) {
            const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
            if (blob) {
              const buffer = await engine.decodeAudioData(blob);
              clips.push({ startTime: clip.startTime, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
            }
          }
        }
      }

      const wavBlob = await exportMixToWav(clips, project.totalDuration);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('WAV exported successfully');
      setShow(false);
    } catch (error) {
      console.error('Export failed:', error);
      toastError('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const readyClips = project.tracks.flatMap((t) =>
    t.clips.filter((c) => c.generationStatus === 'ready' && c.isolatedAudioKey),
  );
  const anySoloed = project.tracks.some((t) => t.soloed);
  const hasExportableContent = project.tracks.some((track) => {
    if (track.muted) return false;
    if (anySoloed && !track.soloed) return false;

    const hasReadyAudio = track.clips.some((clip) => clip.generationStatus === 'ready' && clip.isolatedAudioKey);
    const hasMidiNotes = track.trackType === 'pianoRoll'
      && track.clips.some((clip) => (clip.midiData?.notes?.length ?? 0) > 0);
    const hasSequencerSteps = track.trackType === 'sequencer'
      && track.sequencerPattern?.rows.some((row) => !row.muted && row.steps.some((step) => step.active));

    return hasReadyAudio || hasMidiNotes || Boolean(hasSequencerSteps);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[360px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Export Mix</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-400">
            Export all generated clips as a stereo WAV file at 48kHz.
          </p>
          <p className="text-xs text-zinc-500">
            {readyClips.length} clip{readyClips.length !== 1 ? 's' : ''} ready across{' '}
            {project.tracks.length} track{project.tracks.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !hasExportableContent}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export WAV'}
          </button>
        </div>
      </div>
    </div>
  );
}
