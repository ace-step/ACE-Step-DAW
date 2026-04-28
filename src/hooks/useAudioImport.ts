import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { getAudioEngine } from './useAudioEngine';
import { saveAudioBlob, loadAudioBlobByKey } from '../services/audioFileManager';
import { computeWaveformWithMipmap } from '../utils/waveformPeaks';
import { audioBufferToWavBlob } from '../utils/wav';
import { parseMidiFile } from '../utils/midi';
import { toastError, toastInfo, toastSuccess } from './useToast';
import { LOOP_DEFINITIONS, loadLoop } from '../engine/LoopLibrary';
import { createDebugLogger } from '../utils/debugLogger';

const log = createDebugLogger('audio-import');

function trimAudioBuffer(
  engine: ReturnType<typeof getAudioEngine>,
  audioBuffer: AudioBuffer,
  clipDuration: number,
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const trimmedLength = Math.min(
    Math.floor(clipDuration * sampleRate),
    audioBuffer.length,
  );
  const trimmedBuffer = engine.ctx.createBuffer(
    audioBuffer.numberOfChannels,
    trimmedLength,
    sampleRate,
  );
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const src = audioBuffer.getChannelData(ch);
    const dst = trimmedBuffer.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      dst[i] = src[i];
    }
  }
  return trimmedBuffer;
}

export function useAudioImport() {
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const createQuickSamplerTrack = useProjectStore((s) => s.createQuickSamplerTrack);
  const restoreAssetToNewTrack = useProjectStore((s) => s.restoreAssetToNewTrack);
  const updateClipStatus = useProjectStore((s) => s.updateClipStatus);

  const maybeApplyImportedMidiMetadata = useCallback((fileName: string, bpm?: number, timeSignature?: number) => {
    const project = useProjectStore.getState().project;
    if (!project) return { bpm: 120, timeSignature: 4 };

    const shouldPrompt = (
      (bpm !== undefined && Math.round(project.bpm) !== Math.round(bpm))
      || (timeSignature !== undefined && project.timeSignature !== timeSignature)
    );

    let effectiveBpm = project.bpm;
    let effectiveTimeSignature = project.timeSignature;

    if (shouldPrompt) {
      const promptMessage = [
        `${fileName} includes MIDI metadata.`,
        bpm !== undefined ? `Tempo: ${Math.round(bpm * 100) / 100} BPM` : null,
        timeSignature !== undefined ? `Time signature: ${timeSignature}/4` : null,
        'Apply this to the project?',
      ].filter(Boolean).join('\n');

      const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(promptMessage)
        : false;

      if (confirmed) {
        const updates: { bpm?: number; timeSignature?: number } = {};
        if (bpm !== undefined) {
          effectiveBpm = bpm;
          updates.bpm = bpm;
        }
        if (timeSignature !== undefined) {
          effectiveTimeSignature = timeSignature;
          updates.timeSignature = timeSignature;
        }
        updateProject(updates);
        toastInfo('Imported MIDI tempo and time signature applied');
      }
    }

    return { bpm: effectiveBpm, timeSignature: effectiveTimeSignature };
  }, [updateProject]);

  const importAudioBufferToTrack = useCallback(async (
    audioBuffer: AudioBuffer,
    name: string,
    trackId: string,
    startTime: number,
  ) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const engine = getAudioEngine();
    await engine.resume();

    const duration = audioBuffer.duration;
    const clipDuration = Math.min(duration, project.totalDuration - startTime);
    if (clipDuration <= 0) return;

    const clip = addClip(trackId, {
      startTime,
      duration: clipDuration,
      prompt: `Imported: ${name}`,
      lyrics: '',
    });

    const trimmedBuffer = trimAudioBuffer(engine, audioBuffer, clipDuration);
    const wavBlob = audioBufferToWavBlob(trimmedBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
    const peaks = await computeWaveformWithMipmap(isolatedKey, trimmedBuffer);

    updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      audioDuration: clipDuration,
      audioOffset: 0,
      source: 'uploaded',
    });

    toastSuccess('Audio file imported');
  }, [addClip, updateClipStatus]);

  const importAudioFile = useCallback(async (file: File, startTime: number = 0) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const engine = getAudioEngine();
    await engine.resume();

    // Decode the audio file
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;

    const track = addTrack('custom', 'sample');
    // Rename to the file name
    useProjectStore.getState().updateTrack(track.id, {
      displayName: file.name.replace(/\.[^.]+$/, ''),
    });

    // Create a clip spanning the audio at the specified position
    const clipDuration = Math.min(duration, project.totalDuration - startTime);
    if (clipDuration <= 0) return;
    const clip = addClip(track.id, {
      startTime,
      duration: clipDuration,
      prompt: `Imported: ${file.name}`,
      lyrics: '',
    });

    const trimmedBuffer = trimAudioBuffer(engine, audioBuffer, clipDuration);

    // Convert to WAV and store
    const wavBlob = audioBufferToWavBlob(trimmedBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);

    // Compute waveform peaks with mipmap
    const peaks = await computeWaveformWithMipmap(isolatedKey, trimmedBuffer);

    // Mark clip as ready with uploaded source
    updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      audioDuration: clipDuration,
      audioOffset: 0,
      source: 'uploaded',
    });

    toastSuccess('Audio file imported');
  }, [addTrack, addClip, updateClipStatus]);

  const importAudioToTrack = useCallback(async (file: File, trackId: string, startTime: number) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const engine = getAudioEngine();
    await engine.resume();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    await importAudioBufferToTrack(audioBuffer, file.name, trackId, startTime);
  }, [importAudioBufferToTrack]);

  const importAudioFileAsSampler = useCallback(async (file: File, trackId: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const engine = getAudioEngine();
    await engine.resume();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const audioKey = await saveAudioBlob(project.id, `sampler-${trackId}`, 'isolated', wavBlob);
    const sampleName = file.name.replace(/\.[^.]+$/, '');
    const track = createQuickSamplerTrack({
      trackId,
      audioKey,
      sampleName,
      sampleDuration: audioBuffer.duration,
    });
    if (track) {
      useUIStore.getState().setOpenPianoRoll(track.id);
    }
    toastSuccess(`Loaded sampler source: ${sampleName}`);
  }, [createQuickSamplerTrack]);

  const importAudioFileAsNewQuickSampler = useCallback(async (file: File) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const engine = getAudioEngine();
    await engine.resume();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const sampleName = file.name.replace(/\.[^.]+$/, '');
    const audioKey = await saveAudioBlob(project.id, `sampler-${sampleName}-${crypto.randomUUID()}`, 'isolated', wavBlob);
    const track = createQuickSamplerTrack({
      audioKey,
      sampleName,
      sampleDuration: audioBuffer.duration,
    });
    if (track) {
      useUIStore.getState().setOpenPianoRoll(track.id);
    }
    toastSuccess(`Created Quick Sampler: ${sampleName}`);
  }, [createQuickSamplerTrack]);

  const importMidiFile = useCallback(async (file: File, startTime: number = 0) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    try {
      const parsed = parseMidiFile(await file.arrayBuffer());
      if (parsed.tracks.length === 0) {
        toastError('No MIDI note data found in file');
        return;
      }

      const applied = maybeApplyImportedMidiMetadata(
        file.name,
        parsed.bpm,
        parsed.timeSignature?.denominator === 4 ? parsed.timeSignature.numerator : undefined,
      );
      const baseName = file.name.replace(/\.(mid|midi)$/i, '');

      parsed.tracks.forEach((parsedTrack, index) => {
        const track = addTrack('keyboard', 'pianoRoll');
        updateTrack(track.id, {
          displayName: parsedTrack.name || (parsed.tracks.length === 1 ? baseName : `${baseName} ${index + 1}`),
        });

        const clipBeats = parsedTrack.notes.reduce(
          (max, note) => Math.max(max, note.startBeat + note.durationBeats),
          applied.timeSignature,
        );
        const clipDurationSeconds = Math.max((clipBeats * 60) / applied.bpm, (applied.timeSignature * 60) / applied.bpm);

        addClip(track.id, {
          startTime,
          duration: clipDurationSeconds,
          prompt: `Imported MIDI: ${file.name}`,
          lyrics: '',
          source: 'uploaded',
          midiData: {
            notes: parsedTrack.notes.map((note) => ({ ...note, id: crypto.randomUUID() })),
            grid: '1/16',
          },
        });
      });

      toastSuccess(`Imported MIDI into ${parsed.tracks.length} piano roll track${parsed.tracks.length === 1 ? '' : 's'}`);
    } catch (error) {
      log.error(error);
      toastError(`Failed to import MIDI file: ${file.name}`);
    }
  }, [addClip, addTrack, maybeApplyImportedMidiMetadata, updateTrack]);

  const importMultipleFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
        await importAudioFile(file);
      } else if (/\.(mid|midi)$/i.test(file.name)) {
        await importMidiFile(file);
      }
    }
  }, [importAudioFile, importMidiFile]);

  const openFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mid,.midi';
    input.multiple = true;
    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        await importMultipleFiles(input.files);
      }
    };
    input.click();
  }, [importMultipleFiles]);

  const openSamplerFilePicker = useCallback((trackId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        await importAudioFileAsSampler(file, trackId);
      }
    };
    input.click();
  }, [importAudioFileAsSampler]);

  const openQuickSamplerFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        await importAudioFileAsNewQuickSampler(file);
      }
    };
    input.click();
  }, [importAudioFileAsNewQuickSampler]);

  const importLoopToTrack = useCallback(async (loopId: string, trackId: string, startTime: number) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const def = LOOP_DEFINITIONS.find((d) => d.id === loopId);
    if (!def) return;

    const { audioBuffer, waveformData } = await loadLoop(def);
    const duration = audioBuffer.duration;
    const clipDuration = Math.min(duration, project.totalDuration - startTime);
    if (clipDuration <= 0) return;

    const clip = addClip(trackId, {
      startTime,
      duration: clipDuration,
      prompt: `Loop: ${def.name}`,
      lyrics: '',
    });

    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
    const peaks = await computeWaveformWithMipmap(isolatedKey, audioBuffer);

    updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      audioDuration: clipDuration,
      audioOffset: 0,
      source: 'uploaded',
    });
  }, [addClip, updateClipStatus]);

  const importAssetToTrack = useCallback(async (assetId: string, trackId: string, startTime: number) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const asset = (project.assets ?? []).find((a) => a.id === assetId);
    if (!asset) return;

    const audioKey = asset.isolatedAudioKey ?? asset.cumulativeMixKey;
    if (!audioKey) return;

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) return;

    const engine = getAudioEngine();
    await engine.resume();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);

    const duration = audioBuffer.duration;
    const clipDuration = Math.min(duration, project.totalDuration - startTime);
    if (clipDuration <= 0) return;

    const clip = addClip(trackId, {
      startTime,
      duration: clipDuration,
      prompt: asset.prompt || `From: ${asset.trackDisplayName}`,
      lyrics: '',
    });

    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
    const peaks = asset.waveformPeaks ?? await computeWaveformWithMipmap(isolatedKey, audioBuffer);

    updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      audioDuration: clipDuration,
      audioOffset: 0,
      source: asset.source,
    });
  }, [addClip, updateClipStatus]);

  const importAssetAsQuickSampler = useCallback(async (assetId: string, trackId?: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const asset = (project.assets ?? []).find((candidate) => candidate.id === assetId);
    if (!asset) return;

    const audioKey = asset.isolatedAudioKey ?? asset.cumulativeMixKey;
    if (!audioKey) return;

    const blob = await loadAudioBlobByKey(audioKey);
    if (!blob) return;

    const engine = getAudioEngine();
    await engine.resume();
    const audioBuffer = await engine.decodeAudioData(blob);
    const track = createQuickSamplerTrack({
      trackId,
      audioKey,
      sampleName: asset.prompt || asset.trackDisplayName,
      sampleDuration: audioBuffer.duration,
    });
    if (track) {
      useUIStore.getState().setOpenPianoRoll(track.id);
    }
    toastSuccess(`Created Quick Sampler: ${asset.prompt || asset.trackDisplayName}`);
  }, [createQuickSamplerTrack]);

  const importAssetAsNewTrack = useCallback(async (
    assetId: string,
    startTime: number,
    options?: { order?: number },
  ) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const asset = (project.assets ?? []).find((candidate) => candidate.id === assetId);
    if (!asset) return;

    if (asset.source === 'generated') {
      const hadOriginSnapshot = Boolean(asset.originTrackSnapshot);
      const restoredTrack = restoreAssetToNewTrack(assetId, startTime, options);
      if (restoredTrack) {
        if (!hadOriginSnapshot) {
          toastInfo('Original AI track metadata was unavailable, so the asset was restored as an audio track');
        }
        toastSuccess(`Restored generated track: ${restoredTrack.displayName}`);
        return;
      }
    }

    await importAssetAsQuickSampler(assetId);
  }, [importAssetAsQuickSampler, restoreAssetToNewTrack]);

  const openGranularFilePicker = useCallback((trackId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const project = useProjectStore.getState().project;
      if (!project) return;

      try {
        const engine = getAudioEngine();
        await engine.resume();

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
        const wavBlob = audioBufferToWavBlob(audioBuffer);
        const audioKey = await saveAudioBlob(project.id, `granular-${trackId}`, 'isolated', wavBlob);
        const sampleName = file.name.replace(/\.[^.]+$/, '');

        const { createGranularSettings } = await import('../engine/GranularEngine');
        const granularConfig = createGranularSettings(audioKey);
        const store = useProjectStore.getState();
        store.updateTrack(trackId, {
          instrument: {
            kind: 'granular',
            preset: 'granular',
            name: sampleName,
            settings: granularConfig,
          },
        });
        store.updateGranularConfig(trackId, granularConfig);
        toastSuccess(`Loaded granular source: ${sampleName}`);
      } catch (err) {
        toastError(`Failed to load granular source: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    input.click();
  }, []);

  return {
    importAudioFile,
    importAudioBufferToTrack,
    importAudioToTrack,
    importAudioFileAsSampler,
    importAudioFileAsNewQuickSampler,
    importMidiFile,
    importMultipleFiles,
    openFilePicker,
    openSamplerFilePicker,
    openQuickSamplerFilePicker,
    openGranularFilePicker,
    importLoopToTrack,
    importAssetToTrack,
    importAssetAsQuickSampler,
    importAssetAsNewTrack,
  };
}
