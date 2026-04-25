import { useEffect, useState } from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { parseShareParams } from '../services/collaborationService';
import { cloudStorage, type SharedProjectRecord } from '../services/cloudStorageService';
import { toastInfo } from './useToast';

/**
 * On mount, check the URL for share parameters (?share=...&project=...).
 * If present, activate viewer mode and set the share context.
 */
export function useShareLink(): {
  sharedProject: SharedProjectRecord | null;
  loadingSharedProject: boolean;
} {
  const [sharedProject, setSharedProject] = useState<SharedProjectRecord | null>(null);
  const [loadingSharedProject, setLoadingSharedProject] = useState(false);

  useEffect(() => {
    const params = parseShareParams(window.location.search);
    if (!params) return;

    const { token, readOnly, expiresAt, mode } = params;

    // Check expiration
    if (expiresAt && Date.now() > expiresAt) {
      toastInfo('This share link has expired');
      return;
    }

    if (readOnly) {
      useCollaborationStore.getState().setViewerMode(true);
      toastInfo('Opened in viewer mode (read-only)');
    }

    useCollaborationStore.getState().setActiveShare(token, window.location.href);

    if (mode === 'player') {
      setLoadingSharedProject(true);
      void cloudStorage.loadSharedProject(token).then((record) => {
        if (!record) {
          toastInfo('Shared project was not found in storage');
          return;
        }
        setSharedProject(record);
      }).catch(() => {
        toastInfo('Failed to load shared project');
      }).finally(() => {
        setLoadingSharedProject(false);
      });
    }
  }, []);

  return { sharedProject, loadingSharedProject };
}
