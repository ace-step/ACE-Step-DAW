import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { exportMix, type ExportClip } from '../../engine/exportMix';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from '../../engine/offlineRender';
import { createSamplerConfig } from '../../engine/SamplerEngine';
import { toastError, toastSuccess } from '../../hooks/useToast';
import {
  type ExportFormat,
  type ExportMetadata,
  type Mp3Bitrate,
  type SampleRateOption,
  type BitDepth,
  type ExportOptions,
  DEFAULT_EXPORT_OPTIONS,
  estimateFileSize,
  formatFileSize,
} from '../../utils/audioEncoders';

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'wav', label: 'WAV' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG (Opus)' },
];

const BITRATE_OPTIONS: { value: Mp3Bitrate; label: string }[] = [
  { value: 128, label: '128 kbps' },
  { value: 192, label: '192 kbps' },
  { value: 256, label: '256 kbps' },
  { value: 320, label: '320 kbps' },
];

const SAMPLE_RATE_OPTIONS: { value: SampleRateOption; label: string }[] = [
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' },
];

const BIT_DEPTH_OPTIONS: { value: BitDepth; label: string }[] = [
  { value: 16, label: '16-bit' },
  { value: 24, label: '24-bit' },
];

function fileExtension(format: ExportFormat): string {
  switch (format) {
    case 'mp3': return '.mp3';
    case 'flac': return '.flac';
    case 'ogg': return '.ogg';
    default: return '.wav';
  }
}

export function ExportDialog() {
  const show = useUIStore((s) => s.showExportDialog);
  const setShow = useUIStore((s) => s.setShowExportDialog);
  const project = useProjectStore((s) => s.project);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState<ExportMetadata>({
    title: project?.name ?? '',
    artist: '',
  });

  if (!show || !project) return null;

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    try {
      const engine = getAudioEngine();
      const clips: ExportClip[] = [];

      const anySoloed = project.tracks.some((t) => t.soloed);
      const totalTracks = project.tracks.length;
      let processedTracks = 0;

      for (const track of project.tracks) {
        if (track.muted) { processedTracks++; continue; }
        if (anySoloed && !track.soloed) { processedTracks++; continue; }

        if (track.trackType === 'pianoRoll') {
          for (const clip of track.clips) {
            const notes = clip.midiData?.notes ?? [];
            if (notes.length === 0) continue;

            let buffer: AudioBuffer | null = null;
            if (track.synthPreset === 'sampler' && track.sampler?.audioKey) {
              const samplerBlob = await loadAudioBlobByKey(track.sampler.audioKey);
              if (samplerBlob) {
                const sampleBuffer = await engine.decodeAudioData(samplerBlob);
                buffer = await renderSamplerTrackOffline(
                  notes,
                  clip.startTime,
                  project.bpm,
                  sampleBuffer,
                  track.samplerConfig ?? createSamplerConfig(track.sampler.audioKey, {
                    rootNote: track.sampler.rootNote,
                    trimEnd: track.sampler.sampleDuration,
                    loopEnd: track.sampler.sampleDuration,
                  }),
                  project.totalDuration,
                );
              }
            } else {
              buffer = await renderMidiTrackOffline(
                notes,
                clip.startTime,
                project.bpm,
                track.synthPreset ?? 'piano',
                project.totalDuration,
              );
            }
            if (!buffer) continue;
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

        processedTracks++;
        setProgress(Math.round((processedTracks / totalTracks) * 50));
      }

      setProgress(60);
      const optionsWithMeta = {
        ...exportOptions,
        metadata: (metadata.title || metadata.artist) ? metadata : undefined,
      };
      const blob = await exportMix(clips, project.totalDuration, optionsWithMeta);
      setProgress(90);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}${fileExtension(exportOptions.format)}`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
      toastSuccess(`${exportOptions.format.toUpperCase()} exported successfully`);
      setShow(false);
    } catch (error) {
      console.error('Export failed:', error);
      toastError('Export failed');
    } finally {
      setExporting(false);
      setProgress(0);
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

  const estimatedSize = estimateFileSize(
    project.totalDuration,
    exportOptions.sampleRate,
    2,
    exportOptions,
  );

  const selectClass = 'w-full bg-daw-surface-2 border border-daw-border rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-daw-accent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
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
          {/* Format selector */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Format</label>
            <select
              data-testid="export-format-select"
              className={selectClass}
              value={exportOptions.format}
              onChange={(e) =>
                setExportOptions((prev) => ({ ...prev, format: e.target.value as ExportFormat }))
              }
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Sample rate */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Sample Rate</label>
            <select
              data-testid="export-sample-rate-select"
              className={selectClass}
              value={exportOptions.sampleRate}
              onChange={(e) =>
                setExportOptions((prev) => ({ ...prev, sampleRate: Number(e.target.value) as SampleRateOption }))
              }
            >
              {SAMPLE_RATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Bit depth (WAV & FLAC only) */}
          {exportOptions.format !== 'mp3' && exportOptions.format !== 'ogg' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Bit Depth</label>
              <select
                data-testid="export-bit-depth-select"
                className={selectClass}
                value={exportOptions.bitDepth}
                onChange={(e) =>
                  setExportOptions((prev) => ({ ...prev, bitDepth: Number(e.target.value) as BitDepth }))
                }
              >
                {BIT_DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* MP3 bitrate (MP3 only) */}
          {exportOptions.format === 'mp3' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Bitrate</label>
              <select
                data-testid="export-bitrate-select"
                className={selectClass}
                value={exportOptions.mp3Bitrate}
                onChange={(e) =>
                  setExportOptions((prev) => ({ ...prev, mp3Bitrate: Number(e.target.value) as Mp3Bitrate }))
                }
              >
                {BITRATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* OGG quality (OGG only) */}
          {exportOptions.format === 'ogg' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Quality: {Math.round(exportOptions.oggQuality * 10)}/10
              </label>
              <input
                data-testid="export-ogg-quality"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={exportOptions.oggQuality}
                onChange={(e) =>
                  setExportOptions((prev) => ({ ...prev, oggQuality: Number(e.target.value) }))
                }
                className="w-full accent-daw-accent"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                <span>Smaller</span>
                <span>~{Math.round(32 + exportOptions.oggQuality * 288)} kbps</span>
                <span>Better</span>
              </div>
            </div>
          )}

          {/* Metadata (MP3 & FLAC) */}
          {(exportOptions.format === 'mp3' || exportOptions.format === 'flac') && (
            <div className="space-y-2 pt-1 border-t border-daw-border">
              <label className="block text-xs text-zinc-400">Metadata</label>
              <input
                data-testid="export-metadata-title"
                type="text"
                placeholder="Title"
                value={metadata.title ?? ''}
                onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full bg-daw-surface-2 border border-daw-border rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-daw-accent"
              />
              <input
                data-testid="export-metadata-artist"
                type="text"
                placeholder="Artist"
                value={metadata.artist ?? ''}
                onChange={(e) => setMetadata((prev) => ({ ...prev, artist: e.target.value }))}
                className="w-full bg-daw-surface-2 border border-daw-border rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-daw-accent"
              />
            </div>
          )}

          {/* File info */}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {readyClips.length} clip{readyClips.length !== 1 ? 's' : ''} across{' '}
              {project.tracks.length} track{project.tracks.length !== 1 ? 's' : ''}
            </span>
            <span data-testid="export-size-estimate">~{formatFileSize(estimatedSize)}</span>
          </div>

          {/* Progress bar */}
          {exporting && (
            <div className="w-full h-1.5 bg-daw-surface-2 rounded overflow-hidden">
              <div
                className="h-full bg-daw-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
                data-testid="export-progress-bar"
              />
            </div>
          )}
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
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-daw-accent-hover"
          >
            {exporting ? `Exporting... ${progress}%` : `Export ${exportOptions.format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
