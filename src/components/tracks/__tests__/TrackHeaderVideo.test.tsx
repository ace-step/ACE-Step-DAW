import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { useCollaborationStore } from '../../../store/collaborationStore';

// Mock projectStorage to prevent IndexedDB calls
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Video track header behavior', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useProjectStore.getState().createProject();
  });

  it('video track is created with correct type', () => {
    const track = useProjectStore.getState().addTrack('video' as any, 'video' as any);
    expect(track.trackType).toBe('video');
    expect(track.volume).toBe(0);
  });

  it('video track has no audio fields (verifying data model)', () => {
    const track = useProjectStore.getState().addTrack('video' as any, 'video' as any);
    expect(track.pan).toBeUndefined();
    expect(track.eqLowGain).toBeUndefined();
    expect(track.compressorEnabled).toBeUndefined();
    expect(track.sends).toBeUndefined();
    expect(track.effects).toEqual([]);
  });

  it('video track videoSettings are initialized', () => {
    const track = useProjectStore.getState().addTrack('video' as any, 'video' as any);
    expect(track.videoSettings).toBeDefined();
    expect(track.videoSettings!.showPreview).toBe(true);
    expect(track.videoSettings!.videoFollowsEdit).toBe(true);
  });
});
