import type { TrackType, StrudelFromMidiResult } from '../../types/project';
import { isVideoFile } from '../../services/videoService';

export interface TrackLaneFileDropOptions {
  file: File;
  trackType: TrackType | undefined;
  trackId: string;
  startTime: number;
  wantsQuickSampler: boolean;
  importAudioFileAsSampler: (file: File, trackId: string) => Promise<void> | void;
  importAudioFileAsNewQuickSampler: (file: File) => Promise<void> | void;
  importAudioToTrack: (file: File, trackId: string, startTime: number) => Promise<void> | void;
  importVideoToTrack: (file: File, trackId: string, startTime: number) => Promise<void> | void;
  importMidiFile: (file: File, startTime?: number) => Promise<unknown> | unknown;
  convertMidiFileToStrudel: (file: File) => Promise<StrudelFromMidiResult | null>;
  applyStrudelCodeToTrack: (
    code: string,
    targetTrackId?: string | null,
    options?: { label?: string; targetTrackMode?: 'currentOrNew' | 'alwaysNew' },
  ) => Promise<{ trackId: string } | null>;
  setOpenStrudelEditor: (trackId: string | null) => void;
}

function isAudioFile(file: File): boolean {
  return !isMidiFile(file) && (
    file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)
  );
}

function isMidiFile(file: File): boolean {
  return /\.(mid|midi)$/i.test(file.name);
}

export async function processTrackLaneFileDrop(options: TrackLaneFileDropOptions): Promise<void> {
  const {
    file,
    trackType,
    trackId,
    startTime,
    wantsQuickSampler,
    importAudioFileAsSampler,
    importAudioFileAsNewQuickSampler,
    importAudioToTrack,
    importVideoToTrack,
    importMidiFile,
    convertMidiFileToStrudel,
    applyStrudelCodeToTrack,
    setOpenStrudelEditor,
  } = options;

  if (isVideoFile(file)) {
    await importVideoToTrack(file, trackId, startTime);
    return;
  }

  if (isMidiFile(file)) {
    if (trackType === 'strudel') {
      const result = await convertMidiFileToStrudel(file);
      if (result) {
        await applyStrudelCodeToTrack(result.code, trackId, { label: 'Import MIDI File' });
        setOpenStrudelEditor(trackId);
      }
      return;
    }

    await importMidiFile(file, startTime);
    return;
  }

  if (isAudioFile(file)) {
    if (trackType === 'pianoRoll') {
      await importAudioFileAsSampler(file, trackId);
    } else if (wantsQuickSampler) {
      await importAudioFileAsNewQuickSampler(file);
    } else {
      await importAudioToTrack(file, trackId, startTime);
    }
    return;
  }
}
