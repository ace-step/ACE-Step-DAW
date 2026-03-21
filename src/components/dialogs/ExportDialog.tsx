import { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { downloadBlob } from '../../services/browserDownload';
import {
  buildTrackExportClips,
  exportMix,
  exportTrackStems,
  getStemExportTracks,
  trackHasExportableContent,
  type StemExportScope,
} from '../../engine/exportMix';
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
import { Button } from '../ui/Button';

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

function mapExportProgressToPercent(stage: 'rendering' | 'encoding' | 'complete', progress: number): number {
  switch (stage) {
    case 'rendering':
      return 60 + Math.round(progress * 10);
    case 'encoding':
      return 70 + Math.round(progress * 20);
    case 'complete':
    default:
      return 90;
  }
}

type ExportMode = 'mix' | 'stems';

export function ExportDialog() {
  const show = useUIStore((s) => s.showExportDialog);
  const setShow = useUIStore((s) => s.setShowExportDialog);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const project = useProjectStore((s) => s.project);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [exportMode, setExportMode] = useState<ExportMode>('mix');
  const [stemScope, setStemScope] = useState<StemExportScope>('all-audible');
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
      const optionsWithMeta = {
        ...exportOptions,
        metadata: (metadata.title || metadata.artist) ? metadata : undefined,
      };

      if (exportMode === 'stems') {
        const stemTracks = getStemExportTracks(project, {
          scope: stemScope,
          selectedTrackIds,
        }).filter(trackHasExportableContent);

        const exports = await exportTrackStems(
          project,
          stemTracks,
          optionsWithMeta,
          engine,
          ({ completed, total }) => setProgress(Math.round((completed / total) * 100)),
        );

        for (const stemExport of exports) {
          downloadBlob(stemExport.blob, stemExport.fileName);
        }

        setProgress(100);
        toastSuccess(`Exported ${exports.length} stem${exports.length === 1 ? '' : 's'} as ${exportOptions.format.toUpperCase()}`);
      } else {
        const stemTracks = getStemExportTracks(project, { scope: 'all-audible' }).filter(trackHasExportableContent);
        const clips = (await Promise.all(
          stemTracks.map((track) => buildTrackExportClips(project, track, engine)),
        )).flat();

        setProgress(60);
        const blob = await exportMix(
          clips,
          project.totalDuration,
          optionsWithMeta,
          (update) => {
            setProgress(mapExportProgressToPercent(update.stage, update.progress));
          },
        );

        downloadBlob(blob, `${project.name}${fileExtension(exportOptions.format)}`);
        setProgress(100);
        toastSuccess(`${exportOptions.format.toUpperCase()} exported successfully`);
      }
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
  const exportableStemTracks = getStemExportTracks(project, {
    scope: stemScope,
    selectedTrackIds,
  }).filter(trackHasExportableContent);
  const exportableMixTracks = getStemExportTracks(project, { scope: 'all-audible' }).filter(trackHasExportableContent);
  const hasExportableContent = exportMode === 'stems'
    ? exportableStemTracks.length > 0
    : exportableMixTracks.length > 0;
  const selectedTrackCount = selectedTrackIds.size;
  const estimatedChannels = exportMode === 'stems'
    ? Math.max(exportableStemTracks.length, 1) * 2
    : 2;

  const estimatedSize = estimateFileSize(
    project.totalDuration,
    exportOptions.sampleRate,
    estimatedChannels,
    exportOptions,
  );

  const selectClass = 'w-full bg-daw-surface-2 border border-daw-border rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-daw-accent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Export Audio</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <span className="block text-xs text-zinc-400">Export Mode</span>
            <label className="flex items-start gap-2 rounded border border-daw-border bg-daw-surface-2 px-3 py-2 text-xs text-zinc-200">
              <input
                aria-label="Export Mix"
                type="radio"
                name="export-mode"
                checked={exportMode === 'mix'}
                onChange={() => setExportMode('mix')}
              />
              <span>Export Mix</span>
            </label>
            <label className="flex items-start gap-2 rounded border border-daw-border bg-daw-surface-2 px-3 py-2 text-xs text-zinc-200">
              <input
                aria-label="Export Stems"
                type="radio"
                name="export-mode"
                checked={exportMode === 'stems'}
                onChange={() => setExportMode('stems')}
              />
              <span>Export Stems</span>
            </label>
          </div>

          {exportMode === 'stems' && (
            <div className="space-y-2 rounded border border-daw-border bg-daw-surface-2 p-3">
              <span className="block text-xs text-zinc-400">Tracks</span>
              <label className="flex items-start gap-2 text-xs text-zinc-200">
                <input
                  aria-label="All audible tracks"
                  type="radio"
                  name="stem-scope"
                  checked={stemScope === 'all-audible'}
                  onChange={() => setStemScope('all-audible')}
                />
                <span>All audible tracks</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-zinc-200">
                <input
                  aria-label="Selected tracks only"
                  type="radio"
                  name="stem-scope"
                  checked={stemScope === 'selected'}
                  onChange={() => setStemScope('selected')}
                  disabled={selectedTrackCount === 0}
                />
                <span>
                  Selected tracks only
                  <span className="ml-1 text-zinc-500">({selectedTrackCount} selected)</span>
                </span>
              </label>
            </div>
          )}

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
              <div className="flex justify-between text-[10px] text-zinc-400 mt-0.5">
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
          <div className="flex items-center justify-between text-xs text-zinc-400">
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
          <Button variant="default" size="md" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleExport}
            disabled={exporting || !hasExportableContent}
          >
            {exporting
              ? `Exporting... ${progress}%`
              : exportMode === 'stems'
                ? `Export ${exportableStemTracks.length || selectedTrackCount || project.tracks.length} Stem${(exportableStemTracks.length || selectedTrackCount || project.tracks.length) === 1 ? '' : 's'}`
                : `Export ${exportOptions.format.toUpperCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
