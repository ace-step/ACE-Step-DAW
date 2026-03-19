import { beforeEach, describe, expect, it } from 'vitest';
import { useCollaborationStore, type Collaborator } from '../../src/store/collaborationStore';

describe('collaborationStore', () => {
  beforeEach(() => {
    useCollaborationStore.getState().reset();
  });

  it('starts with default state', () => {
    const state = useCollaborationStore.getState();
    expect(state.isViewerMode).toBe(false);
    expect(state.showShareDialog).toBe(false);
    expect(state.activeShareToken).toBeNull();
    expect(state.activeShareUrl).toBeNull();
    expect(state.collaborators).toEqual([]);
    expect(state.hasCloudChanges).toBe(false);
  });

  describe('viewer mode', () => {
    it('toggles viewer mode', () => {
      useCollaborationStore.getState().setViewerMode(true);
      expect(useCollaborationStore.getState().isViewerMode).toBe(true);

      useCollaborationStore.getState().setViewerMode(false);
      expect(useCollaborationStore.getState().isViewerMode).toBe(false);
    });
  });

  describe('share dialog', () => {
    it('toggles share dialog visibility', () => {
      useCollaborationStore.getState().setShowShareDialog(true);
      expect(useCollaborationStore.getState().showShareDialog).toBe(true);

      useCollaborationStore.getState().setShowShareDialog(false);
      expect(useCollaborationStore.getState().showShareDialog).toBe(false);
    });
  });

  describe('active share', () => {
    it('sets and clears active share', () => {
      useCollaborationStore.getState().setActiveShare('token123', 'https://example.com/share');
      const state = useCollaborationStore.getState();
      expect(state.activeShareToken).toBe('token123');
      expect(state.activeShareUrl).toBe('https://example.com/share');

      useCollaborationStore.getState().setActiveShare(null, null);
      expect(useCollaborationStore.getState().activeShareToken).toBeNull();
      expect(useCollaborationStore.getState().activeShareUrl).toBeNull();
    });
  });

  describe('collaborators', () => {
    const alice: Collaborator = {
      id: 'alice-1',
      name: 'Alice',
      color: '#ff0000',
      isOwner: true,
      joinedAt: 1000,
    };
    const bob: Collaborator = {
      id: 'bob-1',
      name: 'Bob',
      color: '#00ff00',
      isOwner: false,
      joinedAt: 2000,
    };

    it('adds collaborators', () => {
      useCollaborationStore.getState().addCollaborator(alice);
      useCollaborationStore.getState().addCollaborator(bob);

      expect(useCollaborationStore.getState().collaborators).toHaveLength(2);
      expect(useCollaborationStore.getState().collaborators[0].name).toBe('Alice');
      expect(useCollaborationStore.getState().collaborators[1].name).toBe('Bob');
    });

    it('removes a collaborator by id', () => {
      useCollaborationStore.getState().setCollaborators([alice, bob]);
      useCollaborationStore.getState().removeCollaborator('alice-1');

      expect(useCollaborationStore.getState().collaborators).toHaveLength(1);
      expect(useCollaborationStore.getState().collaborators[0].name).toBe('Bob');
    });

    it('sets collaborators list directly', () => {
      useCollaborationStore.getState().setCollaborators([alice, bob]);
      expect(useCollaborationStore.getState().collaborators).toHaveLength(2);

      useCollaborationStore.getState().setCollaborators([]);
      expect(useCollaborationStore.getState().collaborators).toHaveLength(0);
    });
  });

  describe('cloud changes', () => {
    it('tracks unsaved cloud changes', () => {
      useCollaborationStore.getState().setHasCloudChanges(true);
      expect(useCollaborationStore.getState().hasCloudChanges).toBe(true);

      useCollaborationStore.getState().setHasCloudChanges(false);
      expect(useCollaborationStore.getState().hasCloudChanges).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      useCollaborationStore.getState().setViewerMode(true);
      useCollaborationStore.getState().setActiveShare('tok', 'url');
      useCollaborationStore.getState().setHasCloudChanges(true);

      useCollaborationStore.getState().reset();

      const state = useCollaborationStore.getState();
      expect(state.isViewerMode).toBe(false);
      expect(state.activeShareToken).toBeNull();
      expect(state.hasCloudChanges).toBe(false);
    });
  });
});
