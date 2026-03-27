import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

const DEFAULT_DEBOUNCE_MS = 30_000;

interface UseAutoSaveOptions {
  /** Debounce interval in milliseconds before auto-saving. Default: 30000 (30s). */
  debounceMs?: number;
}

interface UseAutoSaveReturn {
  /** Current save status: 'saved' | 'saving' | 'unsaved' */
  status: SaveStatus;
  /** Trigger an immediate save, bypassing the debounce timer. */
  saveNow: () => Promise<void>;
}

/**
 * Auto-saves the current project to IndexedDB with dirty detection.
 *
 * - Subscribes to projectStore and detects changes via `updatedAt` timestamp
 * - Debounces writes to IndexedDB (default 30s)
 * - Warns on beforeunload when there are unsaved changes
 * - Provides a `saveNow()` function for Cmd+S immediate save
 */
export function useAutoSave(options?: UseAutoSaveOptions): UseAutoSaveReturn {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const [status, setStatus] = useState<SaveStatus>('saved');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedUpdatedAtRef = useRef<number>(0);
  const isDirtyRef = useRef(false);

  const saveNow = useCallback(async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    setStatus('saving');
    try {
      await saveProjectToIDB(project);
      lastSavedUpdatedAtRef.current = project.updatedAt;
      isDirtyRef.current = false;
      setStatus('saved');
    } catch {
      // On failure, remain unsaved so the next cycle retries
      setStatus('unsaved');
    }

    // Clear any pending debounce timer since we just saved
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Subscribe to project store changes and schedule debounced saves
  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      const project = state.project;
      if (!project) return;

      // Check if project actually changed
      if (project.updatedAt === lastSavedUpdatedAtRef.current) return;

      isDirtyRef.current = true;
      setStatus('unsaved');

      // Reset debounce timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const currentProject = useProjectStore.getState().project;
        if (!currentProject) return;

        setStatus('saving');
        void saveProjectToIDB(currentProject).then(() => {
          lastSavedUpdatedAtRef.current = currentProject.updatedAt;
          isDirtyRef.current = false;
          setStatus('saved');
        });
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [debounceMs]);

  // Beforeunload warning when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        // Legacy browsers need returnValue set
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return { status, saveNow };
}
