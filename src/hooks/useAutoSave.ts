import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';
import { toastError, toastSuccess } from './useToast';

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
  /** Timestamp of last successful save (ms since epoch), or null if never saved. */
  lastSavedAt: number | null;
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
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedUpdatedAtRef = useRef<number>(0);
  const isDirtyRef = useRef(false);
  const isManualSaveRef = useRef(false);

  const saveNow = useCallback(async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    isManualSaveRef.current = true;
    setStatus('saving');
    try {
      await saveProjectToIDB(project);
      lastSavedUpdatedAtRef.current = project.updatedAt;
      // Re-check if project changed during the async save
      const latestProject = useProjectStore.getState().project;
      if (latestProject && latestProject.updatedAt !== project.updatedAt) {
        isDirtyRef.current = true;
        setStatus('unsaved');
      } else {
        isDirtyRef.current = false;
        setStatus('saved');
        // Only clear debounce timer when no concurrent changes detected
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
      setLastSavedAt(Date.now());
      if (isManualSaveRef.current) {
        toastSuccess('Project saved');
      }
    } catch {
      setStatus('unsaved');
      toastError('Save failed — will retry automatically');
    }
    isManualSaveRef.current = false;
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
          // Re-check if project changed during the async save
          const latestProject = useProjectStore.getState().project;
          if (latestProject && latestProject.updatedAt !== currentProject.updatedAt) {
            isDirtyRef.current = true;
            setStatus('unsaved');
          } else {
            isDirtyRef.current = false;
            setStatus('saved');
          }
          setLastSavedAt(Date.now());
        }).catch(() => {
          setStatus('unsaved');
          toastError('Auto-save failed — will retry');
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

  return { status, saveNow, lastSavedAt };
}
