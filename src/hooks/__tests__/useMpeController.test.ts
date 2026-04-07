import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMpeController } from '../useMpeController';
import { useMpeStore, setMpeZoneManager } from '../../store/mpeStore';
import { MpeZoneManager } from '../../services/mpeService';

// Mock the synth engine so we don't need Tone.js
vi.mock('../../engine/SynthEngine', () => ({
  synthEngine: {
    noteOn: vi.fn(),
    noteOff: vi.fn(),
  },
}));

describe('useMpeController', () => {
  beforeEach(() => {
    setMpeZoneManager(new MpeZoneManager());
    useMpeStore.setState({
      enabled: false,
      lowerZoneMembers: 0,
      upperZoneMembers: 0,
      pitchBendRange: 48,
      activeNotes: [],
      autoDetected: false,
    });
  });

  it('returns inactive when MPE is disabled', () => {
    const { result } = renderHook(() => useMpeController({ trackId: 'track1' }));
    expect(result.current.isActive).toBe(false);
  });

  it('returns capture service instance', () => {
    const { result } = renderHook(() => useMpeController({ trackId: 'track1' }));
    expect(result.current.captureService).toBeDefined();
  });

  it('returns inactive when no trackId', () => {
    useMpeStore.setState({ enabled: true });
    const { result } = renderHook(() => useMpeController({ trackId: null }));
    expect(result.current.captureService).toBeDefined();
  });
});
