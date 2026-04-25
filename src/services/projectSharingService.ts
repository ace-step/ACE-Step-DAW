import { exportMix, type ExportClip } from '../engine/exportMix';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from '../engine/offlineRender';
import { createSamplerConfig } from '../engine/SamplerEngine';
import { loadAudioBlobByKey } from './audioFileManager';
import { cloudStorage, type SharedProjectRecord, type SharedStemAsset } from './cloudStorageService';
import { DEFAULT_EXPORT_OPTIONS } from '../utils/audioEncoders';
import type { Project, Track } from '../types/project';

export interface ProjectShareProgress {
  completedTracks: number;
  totalTracks: number;
  currentTrackName: string;
}

interface CreateProjectShareOptions {
  owner?: string;
  onProgress?: (progress: ProjectShareProgress) => void;
}

function buildPlayerShareUrl(baseUrl: string, token: string, projectId: string): string {
  const params = new URLSearchParams();
  params.set('share', token);
  params.set('project', projectId);
  params.set('mode', 'player');
  return `${baseUrl}?${params.toString()}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to convert audio blob'));
    reader.readAsDataURL(blob);
  });
}

async function renderTrackClips(project: Project, track: Track): Promise<ExportClip[]> {
  const { getAudioEngine } = await import('../hooks/useAudioEngine');
  const engine = getAudioEngine();
  const clips: ExportClip[] = [];

  if (track.trackType === 'pianoRoll') {
    for (const clip of track.clips) {
      const notes = clip.midiData?.notes ?? [];
      if (notes.length === 0) {
        continue;
      }

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

      if (buffer) {
        clips.push({
          startTime: 0,
          buffer,
          volume: track.volume,
          pan: track.pan ?? 0,
          effects: track.effects,
        });
      }
    }

    return clips;
  }

  if (track.trackType === 'sequencer' && track.sequencerPattern) {
    const buffer = await renderSequencerTrackOffline(
      track.sequencerPattern,
      project.bpm,
      project.totalDuration,
      track.drumKit ?? '808',
    );
    clips.push({
      startTime: 0,
      buffer,
      volume: track.volume,
      pan: track.pan ?? 0,
      effects: track.effects,
    });
    return clips;
  }

  for (const clip of track.clips) {
    if (clip.generationStatus !== 'ready' || !clip.isolatedAudioKey) {
      continue;
    }

    const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
    if (!blob) {
      continue;
    }

    const buffer = await engine.decodeAudioData(blob);
    clips.push({
      startTime: clip.startTime,
      buffer,
      volume: track.volume,
      pan: track.pan ?? 0,
      effects: track.effects,
    });
  }

  return clips;
}

async function renderTrackStem(project: Project, track: Track): Promise<SharedStemAsset> {
  const clips = await renderTrackClips(project, track);
  const mp3Blob = await exportMix(clips, project.totalDuration, {
    ...DEFAULT_EXPORT_OPTIONS,
    format: 'mp3',
    metadata: {
      title: `${project.name} - ${track.displayName}`,
      artist: 'ACE-Step DAW',
    },
  });

  const lyrics = track.clips
    .map((clip) => clip.lyrics.trim())
    .filter((value) => value.length > 0)
    .join('\n\n');

  return {
    trackId: track.id,
    trackName: track.displayName,
    color: track.color,
    volume: track.volume,
    lyrics,
    audioDataUrl: await blobToDataUrl(mp3Blob),
  };
}

export async function createProjectShare(
  project: Project,
  baseUrl: string,
  options: CreateProjectShareOptions = {},
): Promise<{ shareUrl: string; record: SharedProjectRecord }> {
  const totalTracks = project.tracks.length;
  const stems: SharedStemAsset[] = [];

  for (const [index, track] of project.tracks.entries()) {
    options.onProgress?.({
      completedTracks: index,
      totalTracks,
      currentTrackName: track.displayName,
    });

    const stem = await renderTrackStem(project, track);
    stems.push(stem);
  }

  const record = await cloudStorage.saveSharedProject({
    project,
    owner: options.owner ?? 'Local user',
    stems,
  });

  options.onProgress?.({
    completedTracks: totalTracks,
    totalTracks,
    currentTrackName: 'Upload complete',
  });

  return {
    shareUrl: buildPlayerShareUrl(baseUrl, record.token, project.id),
    record,
  };
}
