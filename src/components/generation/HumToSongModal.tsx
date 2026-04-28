import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { recordingEngine } from '../../engine/RecordingEngine';
import { analyzeHumRecording, type HumAnalysisResult } from '../../services/humToSong';
import { generateCoverClip } from '../../services/generationPipeline';
import { saveAudioBlob } from '../../services/audioFileManager';
import { audioBufferToWavBlob } from '../../utils/wav';
import { computeWaveformWithMipmap } from '../../utils/waveformPeaks';
import type { MidiNote } from '../../types/project';

type Step = 'record' | 'preview' | 'generate';

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function midiPitchName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${PITCH_NAMES[pitch % 12]}${octave}`;
}

const MIN_DURATION = 5;  // seconds
const MAX_DURATION = 60; // seconds

export function HumToSongModal() {
  const show = useUIStore((s) => s.showHumToSongModal);
  const close = useUIStore((s) => s.setShowHumToSongModal);
  const project = useProjectStore((s) => s.project);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const updateClipStatus = useProjectStore((s) => s.updateClipStatus);

  const bpm = project?.bpm ?? 120;

  const [step, setStep] = useState<Step>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [analysis, setAnalysis] = useState<HumAnalysisResult | null>(null);
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [coverStrength, setCoverStrength] = useState(0.5);
  const [isGenerating, setIsGenerating] = useState(false);

  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const stopRecordingRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Reset state when modal opens/closes
  useEffect(() => {
    if (show) {
      setStep('record');
      setIsRecording(false);
      setRecordingDuration(0);
      setInputLevel(0);
      setHasPermission(recordingEngine.hasPermission);
      setPermissionError(false);
      setAnalysis(null);
      setCaption('');
      setLyrics('');
      setCoverStrength(0.5);
      setIsGenerating(false);
      audioBufferRef.current = null;
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    };
  }, [show]);

  const onClose = useCallback(() => {
    if (isRecording) {
      // Stop recording if still active
      recordingEngine.stopRecording('hum-to-song');
    }
    close(false);
  }, [close, isRecording]);

  // Escape key handler
  useEffect(() => {
    if (!show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [show, onClose]);

  const requestMicPermission = useCallback(async () => {
    const granted = await recordingEngine.requestPermission();
    setHasPermission(granted);
    setPermissionError(!granted);
    return granted;
  }, []);

  const startRecording = useCallback(async () => {
    let permission = hasPermission;
    if (!permission) {
      permission = await requestMicPermission();
      if (!permission) return;
    }

    const started = await recordingEngine.startRecording('hum-to-song', 'hum-recording', 0);
    if (!started) return;

    setIsRecording(true);
    startTimeRef.current = Date.now();
    setRecordingDuration(0);

    // Update recording duration timer
    recordingTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setRecordingDuration(elapsed);
      if (elapsed >= MAX_DURATION) {
        stopRecordingRef.current();
      }
    }, 100);

    // Update input level meter
    levelTimerRef.current = setInterval(() => {
      setInputLevel(recordingEngine.getInputLevelLinear());
    }, 50);
  }, [hasPermission, requestMicPermission]);

  const stopRecording = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }

    const result = await recordingEngine.stopRecording('hum-to-song');
    setIsRecording(false);

    if (!result) {
      return;
    }

    if (result.duration < MIN_DURATION) {
      // Recording too short — inform user
      return;
    }

    audioBufferRef.current = result.audioBuffer;

    // Run pitch analysis
    const channelData = result.audioBuffer.getChannelData(0);
    const analysisResult = analyzeHumRecording(
      channelData,
      result.audioBuffer.sampleRate,
      bpm,
    );

    setAnalysis(analysisResult);
    setStep('preview');
  }, [bpm]);

  // Keep ref in sync so startRecording's interval always calls the latest stopRecording
  stopRecordingRef.current = stopRecording;

  const handleGenerate = useCallback(async () => {
    const buffer = audioBufferRef.current;
    if (!buffer || !project || !analysis || analysis.midiNotes.length === 0) return;

    setIsGenerating(true);
    setStep('generate');

    try {
      // 1. Create a new track for the melody MIDI
      const melodyTrack = addTrack('custom', 'pianoRoll');
      renameTrack(melodyTrack.id, 'Hummed Melody (MIDI)');

      // Add MIDI clip with detected melody
      addClip(melodyTrack.id, {
        startTime: 0,
        duration: analysis.durationSeconds,
        prompt: caption || 'Hummed melody',
        lyrics: '',
        midiData: { notes: analysis.midiNotes, grid: '1/16' as const },
      });

      // 2. Create an audio track for the recorded hum
      const humTrack = addTrack('custom', 'mix');
      renameTrack(humTrack.id, 'Hummed Recording');

      const humClip = addClip(humTrack.id, {
        startTime: 0,
        duration: buffer.duration,
        prompt: caption || 'Hummed melody recording',
        lyrics: '',
        source: 'uploaded',
      });

      // Save the recorded audio
      const wavBlob = audioBufferToWavBlob(buffer);
      const isolatedKey = await saveAudioBlob(project.id, humClip.id, 'isolated', wavBlob);
      const peaks = await computeWaveformWithMipmap(isolatedKey, buffer);

      updateClipStatus(humClip.id, 'ready', {
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: buffer.duration,
        audioOffset: 0,
        source: 'uploaded',
      });

      // 3. If user provided a caption, trigger cover generation to transform hum → full arrangement
      if (caption.trim()) {
        await generateCoverClip({
          clipId: humClip.id,
          caption: caption.trim(),
          lyrics: lyrics.trim(),
          coverStrength,
          createNew: true,
          sourceAudioOverride: isolatedKey,
        });
      }

      onClose();
    } catch {
      setIsGenerating(false);
      setStep('preview');
    }
  }, [project, analysis, caption, lyrics, coverStrength, addTrack, addClip, renameTrack, updateClipStatus, onClose]);

  // Preview mini piano roll computed values
  const { minPitch, maxPitch, totalBeats } = useMemo(() => {
    if (!analysis || analysis.midiNotes.length === 0) {
      return { minPitch: 60, maxPitch: 72, totalBeats: 4 };
    }
    const pitches = analysis.midiNotes.map((n: MidiNote) => n.pitch);
    return {
      minPitch: Math.max(0, Math.min(...pitches) - 2),
      maxPitch: Math.min(127, Math.max(...pitches) + 2),
      totalBeats: Math.max(...analysis.midiNotes.map((n: MidiNote) => n.startBeat + n.durationBeats), 4),
    };
  }, [analysis]);

  const pitchRange = maxPitch - minPitch + 1;

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="hum-to-song-modal"
    >
      <div className="w-[560px] max-w-[calc(100vw-24px)] rounded-xl border border-daw-border bg-daw-surface shadow-2xl text-xs text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-daw-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Hum to Song</h2>
            <p className="mt-0.5 text-[10px] text-zinc-400">
              {step === 'record' && 'Record a melody by humming, singing, or tapping.'}
              {step === 'preview' && 'Review detected melody and add a style description.'}
              {step === 'generate' && 'Generating your arrangement\u2026'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close hum to song modal"
            onClick={onClose}
            className="text-base leading-none text-zinc-400 transition-colors hover:text-zinc-200"
          >
            \u00d7
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 border-b border-daw-border px-4 py-2">
          {(['record', 'preview', 'generate'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              {i > 0 && <div className="h-px w-6 bg-zinc-700" />}
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  step === s
                    ? 'bg-violet-500 text-white'
                    : ((['record', 'preview', 'generate'] as const).indexOf(step) > i)
                      ? 'bg-violet-500/30 text-violet-300'
                      : 'bg-zinc-700 text-zinc-500'
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-[10px] ${step === s ? 'text-zinc-200' : 'text-zinc-500'}`}>
                {s === 'record' ? 'Record' : s === 'preview' ? 'Preview' : 'Generate'}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {/* Step 1: Record */}
          {step === 'record' && (
            <div className="space-y-4">
              {permissionError && (
                <div className="rounded-md bg-red-900/30 border border-red-800/50 px-3 py-2 text-[10px] text-red-300">
                  Microphone access was denied. Please grant permission and try again.
                </div>
              )}

              {/* Recording visualizer */}
              <div className="flex flex-col items-center gap-4 rounded-lg border border-[#3a3a3a] bg-[#181818] p-6">
                {/* Level meter */}
                <div className="relative h-2 w-48 overflow-hidden rounded-full bg-[#2a2a2a]">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      isRecording ? 'bg-red-500' : 'bg-zinc-600'
                    }`}
                    style={{ width: `${Math.min(inputLevel * 100, 100)}%` }}
                  />
                </div>

                {/* Duration display */}
                <div className="text-center">
                  <span className="font-mono text-2xl tabular-nums text-zinc-100">
                    {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}
                    :
                    {Math.floor(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="font-mono text-sm text-zinc-500">
                    .{Math.floor((recordingDuration % 1) * 10)}
                  </span>
                </div>

                {/* Duration hint */}
                <p className="text-[10px] text-zinc-500">
                  {isRecording
                    ? `Recording\u2026 (${MAX_DURATION - Math.floor(recordingDuration)}s remaining)`
                    : `Tap the button and hum your melody (${MIN_DURATION}\u2013${MAX_DURATION} seconds)`}
                </p>

                {/* Record button */}
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                    isRecording
                      ? 'bg-red-500 hover:bg-red-400 shadow-red-500/30 shadow-lg animate-pulse'
                      : 'bg-zinc-700 hover:bg-zinc-600'
                  }`}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  data-testid="hum-record-button"
                >
                  {isRecording ? (
                    <div className="h-5 w-5 rounded-sm bg-white" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-red-500" />
                  )}
                </button>
              </div>

              {/* Tips */}
              <div className="rounded-md bg-[#202020] px-3 py-2 text-[10px] text-zinc-400 space-y-1">
                <p className="font-medium text-zinc-300">Tips for best results:</p>
                <ul className="list-disc pl-3.5 space-y-0.5">
                  <li>Hum or sing a clear, single-note melody</li>
                  <li>Keep a steady tempo if possible</li>
                  <li>Minimize background noise</li>
                  <li>5\u201330 seconds works best for most melodies</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && analysis && (
            <div className="space-y-4">
              {/* Melody preview (mini piano roll) */}
              <div className="rounded-lg border border-[#3a3a3a] bg-[#181818] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3a3a3a]">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">Detected Melody</span>
                  <span className="text-[10px] text-zinc-400">
                    {analysis.midiNotes.length} note{analysis.midiNotes.length !== 1 ? 's' : ''} &middot; {analysis.durationSeconds.toFixed(1)}s
                  </span>
                </div>
                <div className="relative h-[120px] overflow-hidden" data-testid="melody-preview">
                  {analysis.midiNotes.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400">
                      No melody detected. Try recording again with a clearer hum.
                    </div>
                  ) : (
                    <>
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#151515] border-r border-[#2a2a2a] z-10">
                        {Array.from({ length: Math.min(pitchRange, 20) }, (_, i) => {
                          const labelCount = Math.min(pitchRange, 20);
                          const pitchProgress = labelCount > 1 ? i / (labelCount - 1) : 0;
                          const interpolatedPitch = maxPitch - ((maxPitch - minPitch) * pitchProgress);
                          const pitch = Math.max(0, Math.min(127, Math.round(interpolatedPitch)));
                          const y = (i / labelCount) * 100;
                          return (
                            <span
                              key={`${pitch}-${i}`}
                              className="absolute left-0.5 text-[7px] text-zinc-600 leading-none"
                              style={{ top: `${y}%` }}
                            >
                              {midiPitchName(pitch)}
                            </span>
                          );
                        })}
                      </div>
                      <div className="absolute left-8 right-0 top-0 bottom-0">
                        {analysis.midiNotes.map((note: MidiNote) => {
                          const x = (note.startBeat / totalBeats) * 100;
                          const w = Math.max((note.durationBeats / totalBeats) * 100, 0.5);
                          const y = ((maxPitch - note.pitch) / pitchRange) * 100;
                          const h = Math.max(100 / pitchRange, 2);
                          return (
                            <div
                              key={note.id}
                              className="absolute rounded-[2px] bg-violet-500/80 border border-violet-400/40"
                              style={{ left: `${x}%`, width: `${w}%`, top: `${y}%`, height: `${h}%` }}
                              title={`${midiPitchName(note.pitch)} (beat ${note.startBeat.toFixed(2)})`}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-[#202020] px-2.5 py-2 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Notes</p>
                  <p className="mt-0.5 font-mono text-sm text-zinc-200">{analysis.midiNotes.length}</p>
                </div>
                <div className="rounded-md bg-[#202020] px-2.5 py-2 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Range</p>
                  <p className="mt-0.5 font-mono text-sm text-zinc-200">
                    {analysis.pitchRange.min > 0
                      ? `${midiPitchName(analysis.pitchRange.min)}\u2013${midiPitchName(analysis.pitchRange.max)}`
                      : '\u2014'}
                  </p>
                </div>
                <div className="rounded-md bg-[#202020] px-2.5 py-2 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Duration</p>
                  <p className="mt-0.5 font-mono text-sm text-zinc-200">{analysis.durationSeconds.toFixed(1)}s</p>
                </div>
              </div>

              {/* Style prompt */}
              <div className="space-y-2">
                <label className="block">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Style Description</span>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="e.g. Dreamy indie pop with soft guitar and gentle drums"
                    className="mt-1 w-full rounded-md border border-[#3a3a3a] bg-[#181818] px-3 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none resize-none"
                    rows={2}
                    data-testid="hum-style-input"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Lyrics (optional)</span>
                  <textarea
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Add lyrics if you want vocals in the generated song"
                    className="mt-1 w-full rounded-md border border-[#3a3a3a] bg-[#181818] px-3 py-2 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none resize-none"
                    rows={2}
                  />
                </label>
              </div>

              {/* Cover strength */}
              <label className="block space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Arrangement Creativity</span>
                  <span className="font-mono text-[10px] text-zinc-400">{(coverStrength * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={coverStrength}
                  onChange={(e) => setCoverStrength(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-[9px] text-zinc-600">
                  <span>Follow melody closely</span>
                  <span>More creative</span>
                </div>
              </label>
            </div>
          )}

          {/* Step 3: Generate */}
          {step === 'generate' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              <p className="text-[11px] text-zinc-300">Creating your melody track and generating arrangement\u2026</p>
              <p className="text-[10px] text-zinc-500">This may take a moment. You can close this dialog — generation will continue in the background.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-daw-border px-4 py-3">
          <div>
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => {
                  setAnalysis(null);
                  audioBufferRef.current = null;
                  setStep('record');
                }}
                className="rounded-md border border-[#444] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-[#5a5a5a] hover:text-white"
              >
                Re-record
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#444] px-3 py-1.5 text-[11px] text-zinc-300 transition-colors hover:border-[#5a5a5a] hover:text-white"
            >
              Cancel
            </button>
            {step === 'preview' && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!analysis || analysis.midiNotes.length === 0 || isGenerating}
                className="rounded-md bg-violet-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                data-testid="hum-generate-button"
              >
                {caption.trim() ? 'Create Melody + Generate Arrangement' : 'Create Melody Track'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
