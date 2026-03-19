import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '../store/projectStore';
import { useGenerationStore } from '../store/generationStore';
import { loadAudioBlobByKey, saveAudioBlob } from './audioFileManager';
import * as api from './aceStepApi';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { MAX_POLL_DURATION_MS, POLL_INTERVAL_MS } from '../constants/defaults';
import type { StemCount, TaskResultItem } from '../types/api';
import type { TrackName } from '../types/project';
import { toastError, toastInfo, toastSuccess } from '../hooks/useToast';

const STEM_LAYOUTS: Record<StemCount, Array<{ stemKey: string; displayName: string; trackName?: TrackName; color: string }>> = {
  2: [
    { stemKey: 'vocals', displayName: 'Vocals', trackName: 'vocals', color: '#f43f5e' },
    { stemKey: 'instrumental', displayName: 'Instrumental', trackName: 'custom', color: '#64748b' },
  ],
  4: [
    { stemKey: 'vocals', displayName: 'Vocals', trackName: 'vocals', color: '#f43f5e' },
    { stemKey: 'drums', displayName: 'Drums', trackName: 'drums', color: '#ef4444' },
    { stemKey: 'bass', displayName: 'Bass', trackName: 'bass', color: '#f97316' },
    { stemKey: 'other', displayName: 'Other', trackName: 'custom', color: '#64748b' },
  ],
  6: [
    { stemKey: 'vocals', displayName: 'Vocals', trackName: 'vocals', color: '#f43f5e' },
    { stemKey: 'drums', displayName: 'Drums', trackName: 'drums', color: '#ef4444' },
    { stemKey: 'bass', displayName: 'Bass', trackName: 'bass', color: '#f97316' },
    { stemKey: 'guitar', displayName: 'Guitar', trackName: 'guitar', color: '#eab308' },
    { stemKey: 'piano', displayName: 'Piano', trackName: 'keyboard', color: '#22c55e' },
    { stemKey: 'other', displayName: 'Other', trackName: 'custom', color: '#64748b' },
  ],
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStemKey(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferStemKey(item: TaskResultItem, fallbackStemKey: string): string {
  const candidates = [
    item.stage,
    item.prompt,
    item.generation_info,
    item.file,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStemKey(candidate);
    if (!normalized) continue;
    if (normalized.includes('backing_vocal')) return 'backing_vocals';
    if (normalized.includes('vocal')) return 'vocals';
    if (normalized.includes('drum')) return 'drums';
    if (normalized.includes('bass')) return 'bass';
    if (normalized.includes('guitar')) return 'guitar';
    if (normalized.includes('piano') || normalized.includes('keys') || normalized.includes('keyboard')) return 'piano';
    if (normalized.includes('instrumental')) return 'instrumental';
    if (normalized.includes('other')) return 'other';
  }

  return fallbackStemKey;
}

export async function separateClipStems(clipId: string, stemCount: StemCount): Promise<boolean> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return false;

  const store = useProjectStore.getState();
  const project = store.project;
  const clip = store.getClipById(clipId);
  if (!project || !clip) return false;

  let sourceAudioBlob: Blob | null = null;
  if (clip.isolatedAudioKey) {
    sourceAudioBlob = (await loadAudioBlobByKey(clip.isolatedAudioKey)) ?? null;
  }
  if (!sourceAudioBlob && clip.cumulativeMixKey) {
    sourceAudioBlob = (await loadAudioBlobByKey(clip.cumulativeMixKey)) ?? null;
  }
  if (!sourceAudioBlob) {
    toastError('No audio available for stem separation');
    return false;
  }

  const jobId = uuidv4();
  const track = store.getTrackForClip(clipId);
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: track?.displayName ?? 'Stem separation',
    status: 'queued',
    progress: `Queued ${stemCount}-stem separation`,
  });

  toastInfo(`Stem separation started (${stemCount} stems)`);
  genStore.setIsGenerating(true);

  try {
    genStore.updateJob(jobId, { status: 'generating', progress: 'Submitting...' });
    const releaseResp = await api.releaseLegoTask(sourceAudioBlob, {
      task_type: 'separate_stems',
      stem_count: stemCount,
      audio_duration: clip.audioDuration ?? clip.duration,
      audio_format: 'wav',
    });

    const taskId = releaseResp.task_id;
    const startTime = Date.now();
    let resultItems: TaskResultItem[] | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);
      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;

      genStore.updateJob(jobId, {
        progress: entry.progress_text || 'Separating stems...',
      });

      if (entry.status === 1) {
        resultItems = JSON.parse(entry.result) as TaskResultItem[];
        break;
      }
      if (entry.status === 2) {
        throw new Error(`Stem separation failed: ${entry.result}`);
      }
    }

    if (!resultItems?.length) {
      throw new Error('Stem separation timed out');
    }

    genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading stems...' });

    const engine = getAudioEngine();
    const layout = STEM_LAYOUTS[stemCount];
    const preparedStems = await Promise.all(
      resultItems.slice(0, layout.length).map(async (item, index) => {
        const blob = await api.downloadAudio(item.file);
        const buffer = await engine.decodeAudioData(blob);
        const peaks = computeWaveformPeaks(buffer, 200);
        const layoutEntry = layout[index];
        const inferredStemKey = inferStemKey(item, layoutEntry.stemKey);
        const matchedLayout = layout.find((candidate) => candidate.stemKey === inferredStemKey) ?? layoutEntry;
        const isolatedAudioKey = await saveAudioBlob(project.id, `${clipId}-${matchedLayout.stemKey}-${index}`, 'isolated', blob);

        return {
          stemKey: matchedLayout.stemKey,
          displayName: matchedLayout.displayName,
          trackName: matchedLayout.trackName,
          color: matchedLayout.color,
          isolatedAudioKey,
          waveformPeaks: peaks,
          duration: buffer.duration,
          prompt: `Stem separation: ${matchedLayout.displayName}`,
        };
      }),
    );

    store.separateStems(clipId, preparedStems);
    genStore.updateJob(jobId, { status: 'done', progress: 'Done' });
    toastSuccess(`Created ${preparedStems.length} separated stem tracks`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stem separation failed';
    genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
    toastError(message);
    return false;
  } finally {
    genStore.setIsGenerating(false);
  }
}
