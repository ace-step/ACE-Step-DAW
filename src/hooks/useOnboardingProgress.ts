import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'ace-step-onboarding-progress';
const DISMISSED_KEY = 'ace-step-onboarding-dismissed';

/**
 * Onboarding milestones — each represents a key feature the user has tried.
 * Tracked in localStorage so progress persists across sessions.
 */
export const ONBOARDING_MILESTONES = [
  { id: 'created_project', label: 'Created a project' },
  { id: 'added_track', label: 'Added a track' },
  { id: 'generated_audio', label: 'Generated audio with AI' },
  { id: 'used_piano_roll', label: 'Opened the Piano Roll' },
  { id: 'used_mixer', label: 'Opened the Mixer' },
  { id: 'used_effects', label: 'Added an effect' },
  { id: 'exported_audio', label: 'Exported audio' },
  { id: 'used_shortcuts', label: 'Used a keyboard shortcut' },
  { id: 'used_session_view', label: 'Tried Session View' },
  { id: 'used_command_palette', label: 'Used the Command Palette' },
] as const;

export type MilestoneId = (typeof ONBOARDING_MILESTONES)[number]['id'];

let listeners = new Set<() => void>();

function getSnapshot(): Set<MilestoneId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as MilestoneId[]);
  } catch {
    return new Set();
  }
}

let cachedSet: Set<MilestoneId> = getSnapshot();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  cachedSet = getSnapshot();
  listeners.forEach((l) => l());
}

export function markMilestone(id: MilestoneId): void {
  const current = getSnapshot();
  if (current.has(id)) return;
  current.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
  } catch {
    // localStorage unavailable
  }
  notify();
}

export function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissProgress(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // localStorage unavailable
  }
  notify();
}

export function useOnboardingProgress() {
  const completed = useSyncExternalStore(
    subscribe,
    () => cachedSet,
    () => new Set<MilestoneId>(),
  );

  const mark = useCallback((id: MilestoneId) => {
    markMilestone(id);
  }, []);

  return {
    completed,
    total: ONBOARDING_MILESTONES.length,
    completedCount: completed.size,
    milestones: ONBOARDING_MILESTONES,
    mark,
    isDismissed: isDismissed(),
    dismiss: dismissProgress,
  };
}
