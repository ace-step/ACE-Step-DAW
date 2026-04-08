import { describe, it, expect, beforeEach } from 'vitest';
import { useCollaborationStore } from '../collaborationStore';
import type { Collaborator } from '../collaborationStore';

describe('collaborationStore', () => {
  beforeEach(() => {
    useCollaborationStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with viewer mode disabled', () => {
      expect(useCollaborationStore.getState().isViewerMode).toBe(false);
    });

    it('starts with share dialog hidden', () => {
      expect(useCollaborationStore.getState().showShareDialog).toBe(false);
    });

    it('starts with no active share', () => {
      const state = useCollaborationStore.getState();
      expect(state.activeShareToken).toBeNull();
      expect(state.activeShareUrl).toBeNull();
    });

    it('starts with empty collaborators', () => {
      expect(useCollaborationStore.getState().collaborators).toEqual([]);
    });

    it('starts with cloud flags disabled', () => {
      const state = useCollaborationStore.getState();
      expect(state.hasCloudChanges).toBe(false);
      expect(state.isCloudProject).toBe(false);
      expect(state.cloudBusy).toBe(false);
      expect(state.cloudProjects).toEqual([]);
    });
  });

  describe('setViewerMode', () => {
    it('enables viewer mode', () => {
      useCollaborationStore.getState().setViewerMode(true);
      expect(useCollaborationStore.getState().isViewerMode).toBe(true);
    });

    it('disables viewer mode', () => {
      useCollaborationStore.getState().setViewerMode(true);
      useCollaborationStore.getState().setViewerMode(false);
      expect(useCollaborationStore.getState().isViewerMode).toBe(false);
    });
  });

  describe('setShowShareDialog', () => {
    it('opens the share dialog', () => {
      useCollaborationStore.getState().setShowShareDialog(true);
      expect(useCollaborationStore.getState().showShareDialog).toBe(true);
    });

    it('closes the share dialog', () => {
      useCollaborationStore.getState().setShowShareDialog(true);
      useCollaborationStore.getState().setShowShareDialog(false);
      expect(useCollaborationStore.getState().showShareDialog).toBe(false);
    });
  });

  describe('setActiveShare', () => {
    it('sets token and URL', () => {
      useCollaborationStore.getState().setActiveShare('token-123', 'https://share.example.com/abc');
      const state = useCollaborationStore.getState();
      expect(state.activeShareToken).toBe('token-123');
      expect(state.activeShareUrl).toBe('https://share.example.com/abc');
    });

    it('clears token and URL with nulls', () => {
      useCollaborationStore.getState().setActiveShare('token-123', 'https://share.example.com/abc');
      useCollaborationStore.getState().setActiveShare(null, null);
      const state = useCollaborationStore.getState();
      expect(state.activeShareToken).toBeNull();
      expect(state.activeShareUrl).toBeNull();
    });
  });

  describe('collaborator management', () => {
    const alice: Collaborator = { id: 'u1', name: 'Alice', color: '#ff0000', isOwner: true, joinedAt: 1000 };
    const bob: Collaborator = { id: 'u2', name: 'Bob', color: '#00ff00', isOwner: false, joinedAt: 2000 };

    it('setCollaborators replaces the list', () => {
      useCollaborationStore.getState().setCollaborators([alice, bob]);
      expect(useCollaborationStore.getState().collaborators).toEqual([alice, bob]);
    });

    it('addCollaborator appends to the list', () => {
      useCollaborationStore.getState().setCollaborators([alice]);
      useCollaborationStore.getState().addCollaborator(bob);
      const collab = useCollaborationStore.getState().collaborators;
      expect(collab).toHaveLength(2);
      expect(collab[1]).toEqual(bob);
    });

    it('removeCollaborator removes by id', () => {
      useCollaborationStore.getState().setCollaborators([alice, bob]);
      useCollaborationStore.getState().removeCollaborator('u1');
      const collab = useCollaborationStore.getState().collaborators;
      expect(collab).toHaveLength(1);
      expect(collab[0].id).toBe('u2');
    });

    it('removeCollaborator is a no-op for unknown id', () => {
      useCollaborationStore.getState().setCollaborators([alice]);
      useCollaborationStore.getState().removeCollaborator('unknown');
      expect(useCollaborationStore.getState().collaborators).toHaveLength(1);
    });
  });

  describe('cloud state', () => {
    it('setHasCloudChanges toggles cloud changes flag', () => {
      useCollaborationStore.getState().setHasCloudChanges(true);
      expect(useCollaborationStore.getState().hasCloudChanges).toBe(true);
    });

    it('setIsCloudProject toggles cloud project flag', () => {
      useCollaborationStore.getState().setIsCloudProject(true);
      expect(useCollaborationStore.getState().isCloudProject).toBe(true);
    });

    it('setCloudProjects sets the project list', () => {
      const projects = [{ id: 'p1', name: 'Song A', updatedAt: 1000 }] as any[];
      useCollaborationStore.getState().setCloudProjects(projects);
      expect(useCollaborationStore.getState().cloudProjects).toEqual(projects);
    });

    it('setCloudBusy toggles busy flag', () => {
      useCollaborationStore.getState().setCloudBusy(true);
      expect(useCollaborationStore.getState().cloudBusy).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const store = useCollaborationStore.getState();
      store.setViewerMode(true);
      store.setShowShareDialog(true);
      store.setActiveShare('tok', 'url');
      store.setCollaborators([{ id: 'u1', name: 'A', color: '#f00', isOwner: true, joinedAt: 0 }]);
      store.setHasCloudChanges(true);
      store.setIsCloudProject(true);
      store.setCloudBusy(true);

      useCollaborationStore.getState().reset();

      const state = useCollaborationStore.getState();
      expect(state.isViewerMode).toBe(false);
      expect(state.showShareDialog).toBe(false);
      expect(state.activeShareToken).toBeNull();
      expect(state.activeShareUrl).toBeNull();
      expect(state.collaborators).toEqual([]);
      expect(state.hasCloudChanges).toBe(false);
      expect(state.isCloudProject).toBe(false);
      expect(state.cloudBusy).toBe(false);
    });
  });
});
