import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

describe('sample browser enhancements in uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      loopBrowserOpen: false,
      loopBrowserCategory: 'All',
      loopBrowserSearch: '',
      previewingLoopId: null,
      recentlyUsedLoopIds: [],
    });
  });

  describe('extended categories', () => {
    it('should accept FX as a valid category', () => {
      useUIStore.getState().setLoopBrowserCategory('FX');
      expect(useUIStore.getState().loopBrowserCategory).toBe('FX');
    });

    it('should accept Vocals as a valid category', () => {
      useUIStore.getState().setLoopBrowserCategory('Vocals');
      expect(useUIStore.getState().loopBrowserCategory).toBe('Vocals');
    });

    it('should accept all original categories', () => {
      for (const cat of ['All', 'Drums', 'Bass', 'Keys', 'Synth'] as const) {
        useUIStore.getState().setLoopBrowserCategory(cat);
        expect(useUIStore.getState().loopBrowserCategory).toBe(cat);
      }
    });
  });

  describe('recently used loop tracking', () => {
    it('should start with an empty recently used list', () => {
      expect(useUIStore.getState().recentlyUsedLoopIds).toEqual([]);
    });

    it('addRecentlyUsedLoop should add a loop ID to the front', () => {
      useUIStore.getState().addRecentlyUsedLoop('loop-808-boom');
      expect(useUIStore.getState().recentlyUsedLoopIds[0]).toBe(
        'loop-808-boom'
      );
    });

    it('addRecentlyUsedLoop should not duplicate IDs', () => {
      useUIStore.getState().addRecentlyUsedLoop('loop-808-boom');
      useUIStore.getState().addRecentlyUsedLoop('loop-sub-bass');
      useUIStore.getState().addRecentlyUsedLoop('loop-808-boom');
      const recent = useUIStore.getState().recentlyUsedLoopIds;
      expect(recent.filter((id) => id === 'loop-808-boom').length).toBe(1);
      expect(recent[0]).toBe('loop-808-boom');
    });

    it('addRecentlyUsedLoop should cap at 20 items', () => {
      for (let i = 0; i < 25; i++) {
        useUIStore.getState().addRecentlyUsedLoop(`loop-${i}`);
      }
      expect(useUIStore.getState().recentlyUsedLoopIds.length).toBe(20);
    });

    it('most recently used should be first', () => {
      useUIStore.getState().addRecentlyUsedLoop('loop-a');
      useUIStore.getState().addRecentlyUsedLoop('loop-b');
      useUIStore.getState().addRecentlyUsedLoop('loop-c');
      const recent = useUIStore.getState().recentlyUsedLoopIds;
      expect(recent[0]).toBe('loop-c');
      expect(recent[1]).toBe('loop-b');
      expect(recent[2]).toBe('loop-a');
    });
  });
});
