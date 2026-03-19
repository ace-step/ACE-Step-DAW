import { useEffect } from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { parseShareParams } from '../services/collaborationService';
import { toastInfo } from './useToast';

/**
 * On mount, check the URL for share parameters (?share=...&project=...).
 * If present, activate viewer mode and set the share context.
 */
export function useShareLink() {
  useEffect(() => {
    const params = parseShareParams(window.location.search);
    if (!params) return;

    const { token, readOnly, expiresAt } = params;

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
  }, []);
}
