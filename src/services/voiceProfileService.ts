/**
 * Voice Profile Service — IndexedDB persistence for voice profiles (#1087)
 *
 * Stores voice profile metadata under `voice:` prefix and audio blobs
 * under `voice-audio:` prefix using idb-keyval (same pattern as projectStorage).
 */

import { get, set, del, keys } from 'idb-keyval';
import type { VoiceProfile } from '../types/voice';
import {
  MAX_VOICE_FILE_SIZE,
  MAX_VOICE_DURATION,
  MIN_VOICE_DURATION,
  ACCEPTED_VOICE_MIME_TYPES,
} from '../types/voice';

const PROFILE_PREFIX = 'voice:';
const AUDIO_PREFIX = 'voice-audio:';

// ── Validation ──

export class VoiceProfileError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_NAME'
      | 'INVALID_DURATION'
      | 'INVALID_FILE_SIZE'
      | 'INVALID_MIME_TYPE'
      | 'NOT_FOUND'
      | 'STORAGE_ERROR',
  ) {
    super(message);
    this.name = 'VoiceProfileError';
  }
}

export function validateName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    throw new VoiceProfileError(
      'Voice name must be 1-100 characters',
      'INVALID_NAME',
    );
  }
}

export function validateDuration(durationSec: number): void {
  if (
    !Number.isFinite(durationSec) ||
    durationSec < MIN_VOICE_DURATION ||
    durationSec > MAX_VOICE_DURATION
  ) {
    throw new VoiceProfileError(
      `Duration must be ${MIN_VOICE_DURATION}–${MAX_VOICE_DURATION} seconds`,
      'INVALID_DURATION',
    );
  }
}

export function validateFileSize(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_VOICE_FILE_SIZE) {
    throw new VoiceProfileError(
      `File size must be 1 byte – ${MAX_VOICE_FILE_SIZE / 1024 / 1024} MB`,
      'INVALID_FILE_SIZE',
    );
  }
}

export function validateMimeType(mime: string): void {
  if (!(ACCEPTED_VOICE_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new VoiceProfileError(
      `Unsupported audio format: ${mime}`,
      'INVALID_MIME_TYPE',
    );
  }
}

// ── CRUD ──

export async function saveVoiceProfile(
  profile: VoiceProfile,
  audioBlob: Blob,
): Promise<void> {
  validateName(profile.name);
  validateDuration(profile.duration);
  validateFileSize(audioBlob.size);
  validateMimeType(profile.mimeType);

  await set(`${PROFILE_PREFIX}${profile.id}`, profile);
  await set(`${AUDIO_PREFIX}${profile.id}`, audioBlob);
}

export async function loadVoiceProfile(
  id: string,
): Promise<VoiceProfile | null> {
  const data = await get<VoiceProfile>(`${PROFILE_PREFIX}${id}`);
  return data ?? null;
}

export async function loadVoiceAudio(id: string): Promise<Blob | null> {
  const blob = await get<Blob>(`${AUDIO_PREFIX}${id}`);
  return blob ?? null;
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  await del(`${PROFILE_PREFIX}${id}`);
  await del(`${AUDIO_PREFIX}${id}`);
}

export async function updateVoiceProfileName(
  id: string,
  newName: string,
): Promise<VoiceProfile> {
  validateName(newName);
  const profile = await loadVoiceProfile(id);
  if (!profile) {
    throw new VoiceProfileError('Voice profile not found', 'NOT_FOUND');
  }
  const updated = { ...profile, name: newName.trim(), updatedAt: Date.now() };
  await set(`${PROFILE_PREFIX}${id}`, updated);
  return updated;
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const allKeys = await keys();
  const profileKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(PROFILE_PREFIX),
  );

  const profiles: VoiceProfile[] = [];
  for (const key of profileKeys) {
    const data = await get<VoiceProfile>(key as string);
    if (data) profiles.push(data);
  }

  return profiles.sort((a, b) => b.updatedAt - a.updatedAt);
}
