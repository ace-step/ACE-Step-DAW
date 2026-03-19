import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { convertSamplesToMidi, loadClipAudioSamples } from '../../services/audioToMidi';
import type { MidiNote } from '../../types/project';
import type { DetectedNote } from '../../utils/pitchDetection';

interface PreviewState {
  status: 'idle' | 'analyzing' | 'done' | 'error';
  midiNotes: MidiNote[];
  detectedNotes: DetectedNote[];
  error?: string;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function midiPitchName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${PITCH_NAMES[pitch % 12]}${octave}`;
}

export function AudioToMidiModal() {
  const clipId = useUIStore((s) => s.audioToMidiClipId);
  const close = useUIStore((s) => s.setAudioToMidiModal);
  const convertAudioToMidi = useProjectStore((s) => s.convertAudioToMidi);
  const getClipById = useProjectStore((s) => s.getClipById);
  const project = useProjectStore((s) => s.project);

  const clip = clipId ? getClipById(clipId) : null;
  const track = project?.tracks.find((t) => t.clips.some((c) => c.id === clipId)) ?? null;
  const bpm = project?.bpm ?? 120;

  const [threshold, setThreshold] = useState(0.15);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [minNoteDuration, setMinNoteDuration] = useState(0.05);

  const samplesRef = useRef<{ samples: Float32Array; sampleRate: number } | null>(null);

  const [preview, setPreview] = useState<PreviewState>({
    status: 'idle',
    midiNotes: [],
    detectedNotes: [],
  });
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (!clip) {
      samplesRef.current = null;
      return;
    }
    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) return;

    let cancelled = false;
    setPreview({ status: 'analyzing', midiNotes: [], detectedNotes: [] });

    loadClipAudioSamples(audioKey).then((data) => {
      if (cancelled) return;
      samplesRef.current = { samples: data.samples, sampleRate: data.sampleRate };
      const result = convertSamplesToMidi(data.samples, data.sampleRate, bpm, 0, {
        threshold,
        minConfidence,
        minNoteDuration,
      });
      setPreview({ status: 'done', midiNotes: result.notes, detectedNotes: result.detectedNotes });
    }).catch((err) => {
      if (cancelled) return;
      setPreview({ status: 'error', midiNotes: [], detectedNotes: [], error: String(err) });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  useEffect(() => {
    const cached = samplesRef.current;
    if (!cached || preview.status === 'idle' || preview.status === 'analyzing') return;

    const result = convertSamplesToMidi(cached.samples, cached.sampleRate, bpm, 0, {
      threshold,
      minConfidence,
      minNoteDuration,
    });
    setPreview((prev) => ({ ...prev, midiNotes: result.notes, detectedNotes: result.detectedNotes }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, minConfidence, minNoteDuration, bpm]);

  const onClose = useCallback(() => close(null), [close]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleConvert = useCallback(async () => {
    if (!clipId || isConverting) return;
    setIsConverting(true);
    try {
      await convertAudioToMidi(clipId, { threshold, minConfidence, minNoteDuration });
      onClose();
    } finally {
      setIsConverting(false);
    }
  }, [clipId, isConverting, convertAudioToMidi, threshold, minConfidence, minNoteDuration, onClose]);

  const { minPitch, maxPitch } = useMemo(() => {
    if (preview.midiNotes.length === 0) return { minPitch: 60, maxPitch: 72 };
    const pitches = preview.midiNotes.map((n) => n.pitch);
    return {
      minPitch: Math.max(0, Math.min(...pitches) - 2),
      maxPitch: Math.min(127, Math.max(...pitches) + 2),
    };
  }, [preview.midiNotes]);

  const totalBeats = useMemo(() => {
    if (preview.midiNotes.length === 0) return 4;
    return Math.max(...preview.midiNotes.map((n) => n.startBeat + n.durationBeats), 4);
  }, [preview.midiNotes]);

  if (!clipId || !clip || !track) return null;

  const hasAudio = Boolean(clip.isolatedAudioKey || clip.cumulativeMixKey);
  const pitchRange = maxPitch - minPitch + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[600px] max-w-[calc(100vw-24px)] rounded-xl border border-daw-border bg-daw-surface shadow-2xl text-xs text-zinc-200">
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Convert to MIDI</h2>
            <p className="mt-1 text-[10px] text-zinc-500">Detect pitches in audio and create editable MIDI notes.</p>
          </div>
          <button
            type="button"
            aria-label="Close audio to MIDI modal"
            onClick={onClose}
            className="text-base leading-none text-zinc-500 transition-colors hover:text-zinc-200"
          >
            x
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="rounded-lg border border-[#3a3a3a] bg-[#202020] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">Source Clip</p>
            <p className="mt-1 text-[11px] font-medium text-zinc-100">{track.displayName}</p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">{clip.prompt || 'Imported audio clip'}</p>
            {!hasAudio && (
              <p className="mt-2 text-[10px] text-amber-400">
                This clip has no audio yet. Generate or import audio before converting.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Detection Settings</p>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="block text-[10px] text-zinc-400">Sensitivity</span>
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <span className="block text-[10px] text-zinc-500 text-center">{threshold.toFixed(2)}</span>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-zinc-400">Min Confidence</span>
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <span className="block text-[10px] text-zinc-500 text-center">{(minConfidence * 100).toFixed(0)}%</span>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-zinc-400">Min Duration</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.3}
                  step={0.01}
                  value={minNoteDuration}
                  onChange={(e) => setMinNoteDuration(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <span className="block text-[10px] text-zinc-500 text-center">{(minNoteDuration * 1000).toFixed(0)}ms</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-[#3a3a3a] bg-[#181818] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3a3a3a]">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Preview</span>
              <span className="text-[10px] text-zinc-500">
                {preview.status === 'analyzing'
                  ? 'Analyzing\u2026'
                  : `${preview.midiNotes.length} note${preview.midiNotes.length !== 1 ? 's' : ''} detected`}
              </span>
            </div>
            <div className="relative h-[120px] overflow-hidden" data-testid="midi-preview">
              {preview.status === 'analyzing' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              )}
              {preview.status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-red-400">
                  {preview.error || 'Detection failed'}
                </div>
              )}
              {preview.status === 'done' && preview.midiNotes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500">
                  No notes detected. Try adjusting sensitivity.
                </div>
              )}
              {preview.status === 'done' && preview.midiNotes.length > 0 && (
                <>
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#151515] border-r border-[#2a2a2a] z-10">
                    {Array.from({ length: pitchRange }, (_, i) => {
                      const pitch = maxPitch - i;
                      const y = (i / pitchRange) * 100;
                      return (
                        <span
                          key={pitch}
                          className="absolute left-0.5 text-[7px] text-zinc-600 leading-none"
                          style={{ top: `${y}%` }}
                        >
                          {midiPitchName(pitch)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="absolute left-8 right-0 top-0 bottom-0">
                    {preview.midiNotes.map((note) => {
                      const x = (note.startBeat / totalBeats) * 100;
                      const w = Math.max((note.durationBeats / totalBeats) * 100, 0.5);
                      const y = ((maxPitch - note.pitch) / pitchRange) * 100;
                      const h = Math.max(100 / pitchRange, 2);
                      return (
                        <div
                          key={note.id}
                          className="absolute rounded-[2px] bg-violet-500/80 border border-violet-400/40"
                          style={{ left: `${x}%`, width: `${w}%`, top: `${y}%`, height: `${h}%` }}
                          title={`${midiPitchName(note.pitch)} (beat ${note.startBeat.toFixed(2)}, ${note.durationBeats.toFixed(2)} beats)`}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-daw-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#444] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-[#5a5a5a] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label="Confirm audio to MIDI conversion"
            onClick={handleConvert}
            disabled={!hasAudio || isConverting || preview.midiNotes.length === 0}
            className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isConverting ? 'Converting\u2026' : `Convert ${preview.midiNotes.length} Notes`}
          </button>
        </div>
      </div>
    </div>
  );
}
