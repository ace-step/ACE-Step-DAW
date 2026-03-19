import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import {
  estimateExportFileSize,
  exportMix,
  getExportExtension,
  type ExportBitDepth,
  type ExportClip,
  type ExportFormat,
  type ExportMp3Bitrate,
  type ExportSampleRate,
} from '../../engine/exportMix';
import { renderMidiTrackOffline, renderSequencerTrackOffline } from '../../engine/offlineRender';
import { toastError, toastSuccess } from '../../hooks/useToast';

export function ExportDialog() {
  const show = useUIStore((s) => s.showExportDialog);
  const setShow = useUIStore((s) => s.setShowExportDialog);
  const project = useProjectStore((s) => s.project);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [sampleRate, setSampleRate] = useState<ExportSampleRate>(48000);
  const [bitDepth, setBitDepth] = useState<ExportBitDepth>(16);
  const [mp3Bitrate, setMp3Bitrate] = useState<ExportMp3Bitrate>(320);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing export');

  if (!show || !project) return null;

  const handleExport = async () => {
    setExporting(true);
    setProgress(0.05);
    setProgressLabel('Preparing export');
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

      const blob = await exportMix(clips, project.totalDuration, {
        format,
        sampleRate,
        bitDepth,
        mp3Bitrate,
        onProgress: (nextProgress, label) => {
          setProgress(nextProgress);
          setProgressLabel(label);
        },
      });
      const extension = getExportExtension(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess(`${format.toUpperCase()} exported successfully`);
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
  const estimatedBytes = estimateExportFileSize(project.totalDuration, { format, sampleRate, bitDepth, mp3Bitrate });
  const estimatedMegabytes = estimatedBytes / (1024 * 1024);
  const exportLabel = `Export ${format.toUpperCase()}`;
  const description = format === 'mp3'
    ? `Export a stereo MP3 at ${sampleRate / 1000}kHz with ${mp3Bitrate} kbps encoding.`
    : `Export a stereo ${format.toUpperCase()} at ${sampleRate / 1000}kHz / ${bitDepth}-bit.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
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
            {description}
          </p>
          <p className="text-xs text-zinc-500">
            {readyClips.length} clip{readyClips.length !== 1 ? 's' : ''} ready across{' '}
            {project.tracks.length} track{project.tracks.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="block">Format</span>
              <select
                aria-label="Export format"
                value={format}
                onChange={(event) => setFormat(event.target.value as ExportFormat)}
                disabled={exporting}
                className="w-full rounded bg-daw-surface-2 border border-daw-border px-2 py-2 text-xs text-zinc-100"
              >
                <option value="wav">WAV</option>
                <option value="mp3">MP3</option>
                <option value="flac">FLAC</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-zinc-400">
              <span className="block">Sample Rate</span>
              <select
                aria-label="Export sample rate"
                value={sampleRate}
                onChange={(event) => setSampleRate(Number(event.target.value) as ExportSampleRate)}
                disabled={exporting}
                className="w-full rounded bg-daw-surface-2 border border-daw-border px-2 py-2 text-xs text-zinc-100"
              >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48 kHz</option>
              </select>
            </label>
            {format === 'mp3' ? (
              <label className="space-y-1 text-xs text-zinc-400 col-span-2">
                <span className="block">Bitrate</span>
                <select
                  aria-label="MP3 bitrate"
                  value={mp3Bitrate}
                  onChange={(event) => setMp3Bitrate(Number(event.target.value) as ExportMp3Bitrate)}
                  disabled={exporting}
                  className="w-full rounded bg-daw-surface-2 border border-daw-border px-2 py-2 text-xs text-zinc-100"
                >
                  <option value={128}>128 kbps</option>
                  <option value={192}>192 kbps</option>
                  <option value={256}>256 kbps</option>
                  <option value={320}>320 kbps</option>
                </select>
              </label>
            ) : (
              <label className="space-y-1 text-xs text-zinc-400 col-span-2">
                <span className="block">Bit Depth</span>
                <select
                  aria-label="Export bit depth"
                  value={bitDepth}
                  onChange={(event) => setBitDepth(Number(event.target.value) as ExportBitDepth)}
                  disabled={exporting}
                  className="w-full rounded bg-daw-surface-2 border border-daw-border px-2 py-2 text-xs text-zinc-100"
                >
                  <option value={16}>16-bit</option>
                  <option value={24}>24-bit</option>
                </select>
              </label>
            )}
          </div>
          <div className="rounded border border-daw-border bg-daw-surface-2 px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>{exporting ? progressLabel : 'Estimated file size'}</span>
              <span>{exporting ? `${Math.round(progress * 100)}%` : `~${estimatedMegabytes.toFixed(1)} MB`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full bg-daw-accent transition-[width] duration-200"
                style={{ width: `${(exporting ? progress : 1) * 100}%` }}
              />
            </div>
          </div>
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
            aria-label={exportLabel}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-daw-accent-hover"
          >
            {exporting ? 'Exporting...' : exportLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
