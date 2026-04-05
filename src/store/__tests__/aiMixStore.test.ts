import { describe, it, expect, beforeEach } from 'vitest';
import { useAiMixStore } from '../aiMixStore';
import type { AiMixResult } from '../../types/api';

function resetStore() {
  useAiMixStore.getState().closePanel();
}

const makeSuggestion = (): AiMixResult => ({
  tracks: {
    vocals: { gain_db: -3, pan: 0, reverb_send: 0.2 },
    drums: { gain_db: -1, pan: 0, compressor: { threshold_db: -18, ratio: 4, attack_ms: 10, release_ms: 100 } },
    bass: { gain_db: -2, pan: -0.1 },
  },
  master: {
    eq: [{ frequency_hz: 80, gain_db: -2, q: 1.5, type: 'highpass' }],
    compressor: { threshold_db: -12, ratio: 2, attack_ms: 30, release_ms: 200 },
    target_lufs: -14,
  },
});

describe('aiMixStore', () => {
  beforeEach(() => resetStore());

  describe('panel management', () => {
    it('opens panel', () => {
      useAiMixStore.getState().openPanel();
      expect(useAiMixStore.getState().panelOpen).toBe(true);
      expect(useAiMixStore.getState().status).toBe('idle');
    });

    it('closes panel and resets', () => {
      useAiMixStore.getState().openPanel();
      useAiMixStore.getState().setSuggestion(makeSuggestion());
      useAiMixStore.getState().closePanel();
      expect(useAiMixStore.getState().panelOpen).toBe(false);
      expect(useAiMixStore.getState().suggestion).toBeNull();
    });
  });

  describe('parameters', () => {
    it('sets mode', () => {
      useAiMixStore.getState().setMode('text');
      expect(useAiMixStore.getState().mode).toBe('text');
    });

    it('sets text prompt', () => {
      useAiMixStore.getState().setTextPrompt('warm vocals');
      expect(useAiMixStore.getState().textPrompt).toBe('warm vocals');
    });

    it('clamps target LUFS to -24 to -6 range', () => {
      useAiMixStore.getState().setTargetLufs(-30);
      expect(useAiMixStore.getState().targetLufs).toBe(-24);
      useAiMixStore.getState().setTargetLufs(0);
      expect(useAiMixStore.getState().targetLufs).toBe(-6);
      useAiMixStore.getState().setTargetLufs(-11);
      expect(useAiMixStore.getState().targetLufs).toBe(-11);
    });
  });

  describe('analysis workflow', () => {
    it('transitions through idle -> analyzing -> reviewing', () => {
      expect(useAiMixStore.getState().status).toBe('idle');

      useAiMixStore.getState().startAnalysis();
      expect(useAiMixStore.getState().status).toBe('analyzing');

      useAiMixStore.getState().setSuggestion(makeSuggestion());
      expect(useAiMixStore.getState().status).toBe('reviewing');
      expect(useAiMixStore.getState().suggestion).not.toBeNull();
      expect(Object.keys(useAiMixStore.getState().suggestion!.tracks)).toHaveLength(3);
    });

    it('accepts all suggestions and returns result', () => {
      useAiMixStore.getState().setSuggestion(makeSuggestion());
      const result = useAiMixStore.getState().acceptAll();
      expect(result).not.toBeNull();
      expect(Object.keys(result!.tracks)).toHaveLength(3);
      expect(useAiMixStore.getState().status).toBe('idle');
      expect(useAiMixStore.getState().suggestion).toBeNull();
    });

    it('accepts a single track suggestion', () => {
      useAiMixStore.getState().setSuggestion(makeSuggestion());
      const params = useAiMixStore.getState().acceptTrack('vocals');
      expect(params).not.toBeNull();
      expect(params!.gain_db).toBe(-3);

      // Remaining tracks still in review
      expect(useAiMixStore.getState().status).toBe('reviewing');
      expect(useAiMixStore.getState().suggestion!.tracks['vocals']).toBeUndefined();
      expect(Object.keys(useAiMixStore.getState().suggestion!.tracks)).toHaveLength(2);
    });

    it('transitions to idle when last track accepted', () => {
      const suggestion = makeSuggestion();
      suggestion.tracks = { vocals: suggestion.tracks['vocals'] };
      useAiMixStore.getState().setSuggestion(suggestion);

      useAiMixStore.getState().acceptTrack('vocals');
      expect(useAiMixStore.getState().status).toBe('idle');
      expect(useAiMixStore.getState().suggestion).toBeNull();
    });

    it('accepts master bus suggestion', () => {
      useAiMixStore.getState().setSuggestion(makeSuggestion());
      const master = useAiMixStore.getState().acceptMaster();
      expect(master).not.toBeNull();
      expect(master!.target_lufs).toBe(-14);
      // Still reviewing because track suggestions remain
      expect(useAiMixStore.getState().status).toBe('reviewing');
    });

    it('rejects all suggestions', () => {
      useAiMixStore.getState().setSuggestion(makeSuggestion());
      useAiMixStore.getState().reject();
      expect(useAiMixStore.getState().status).toBe('idle');
      expect(useAiMixStore.getState().suggestion).toBeNull();
    });

    it('returns null when accepting with no suggestions', () => {
      expect(useAiMixStore.getState().acceptAll()).toBeNull();
      expect(useAiMixStore.getState().acceptTrack('vocals')).toBeNull();
      expect(useAiMixStore.getState().acceptMaster()).toBeNull();
    });
  });

  describe('track expansion', () => {
    it('toggles expanded track', () => {
      useAiMixStore.getState().toggleTrackExpand('vocals');
      expect(useAiMixStore.getState().expandedTrackName).toBe('vocals');
      useAiMixStore.getState().toggleTrackExpand('vocals');
      expect(useAiMixStore.getState().expandedTrackName).toBeNull();
    });

    it('switches to different track', () => {
      useAiMixStore.getState().toggleTrackExpand('vocals');
      useAiMixStore.getState().toggleTrackExpand('drums');
      expect(useAiMixStore.getState().expandedTrackName).toBe('drums');
    });
  });

  describe('error handling', () => {
    it('sets error', () => {
      useAiMixStore.getState().setError('Backend unavailable');
      expect(useAiMixStore.getState().status).toBe('error');
      expect(useAiMixStore.getState().error).toBe('Backend unavailable');
    });

    it('resets from error', () => {
      useAiMixStore.getState().setError('Timeout');
      useAiMixStore.getState().reset();
      expect(useAiMixStore.getState().status).toBe('idle');
      expect(useAiMixStore.getState().error).toBeNull();
    });
  });
});
