import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMidiController } from '../useMidiController';
import { useMidiControllerStore } from '../../store/midiControllerStore';
import { useProjectStore } from '../../store/projectStore';
import type { MidiMessage } from '../../types/midiController';

// Mock WebMidiService
const mockConnect = vi.fn().mockResolvedValue([]);
const mockOnMessage = vi.fn(() => vi.fn());
const mockOnDeviceChange = vi.fn(() => vi.fn());
const mockDestroy = vi.fn();

vi.mock('../../services/webMidiService', () => ({
  WebMidiService: {
    isSupported: vi.fn(() => true),
  },
  getWebMidiService: vi.fn(() => ({
    connect: mockConnect,
    onMessage: mockOnMessage,
    onDeviceChange: mockOnDeviceChange,
    destroy: mockDestroy,
  })),
}));

// Mock MidiMappingEngine
const mockRegisterHandler = vi.fn();
const mockRemoveHandler = vi.fn();
const mockProcessMessage = vi.fn();

vi.mock('../../services/midiMappingEngine', () => ({
  getMidiMappingEngine: vi.fn(() => ({
    registerHandler: mockRegisterHandler,
    removeHandler: mockRemoveHandler,
    processMessage: mockProcessMessage,
  })),
}));

function resetStores() {
  useMidiControllerStore.setState(useMidiControllerStore.getInitialState());
  useProjectStore.setState(useProjectStore.getInitialState(), true);
}

describe('useMidiController', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('registers scope handlers on mount when enabled', () => {
    useMidiControllerStore.setState({ enabled: true });
    renderHook(() => useMidiController());

    expect(mockRegisterHandler).toHaveBeenCalledWith('track', expect.any(Function));
    expect(mockRegisterHandler).toHaveBeenCalledWith('master', expect.any(Function));
    expect(mockRegisterHandler).toHaveBeenCalledWith('transport', expect.any(Function));
  });

  it('does not connect when disabled (default state)', () => {
    // Default is enabled: false, so no connection without explicit enable
    renderHook(() => useMidiController());

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('subscribes to device changes and MIDI messages', () => {
    useMidiControllerStore.setState({ enabled: true });
    renderHook(() => useMidiController());

    expect(mockOnDeviceChange).toHaveBeenCalled();
    expect(mockOnMessage).toHaveBeenCalled();
  });

  it('stores MIDI connection errors for the panel', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Permission denied'));
    useMidiControllerStore.setState({ enabled: true });

    renderHook(() => useMidiController());
    await waitFor(() => {
      expect(useMidiControllerStore.getState().connectionError).toBe('Permission denied');
    });
  });

  it('unsubscribes on cleanup', () => {
    useMidiControllerStore.setState({ enabled: true });
    const { unmount } = renderHook(() => useMidiController());

    unmount();
    expect(mockDestroy).toHaveBeenCalled();
    expect(mockRemoveHandler).toHaveBeenCalledWith('track');
    expect(mockRemoveHandler).toHaveBeenCalledWith('master');
    expect(mockRemoveHandler).toHaveBeenCalledWith('transport');
  });

  it('handles MIDI Learn completion on CC message', () => {
    useMidiControllerStore.setState({
      enabled: true,
      learnMode: {
        active: true,
        targetParam: 'track:t1:volume',
        targetLabel: 'Track 1 Volume',
      },
      devices: [{ id: 'dev-1', name: 'Controller', manufacturer: 'Test', state: 'connected' }],
    });

    renderHook(() => useMidiController());

    // Get the message handler that was registered
    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;

    // Simulate a CC message while learn mode is active
    messageHandler({
      deviceId: 'dev-1',
      channel: 0,
      type: 'cc',
      control: 7,
      value: 64,
      timestamp: 1000,
    });

    // Learn mode should be deactivated
    expect(useMidiControllerStore.getState().learnMode.active).toBe(false);
    // A mapping should have been created
    expect(useMidiControllerStore.getState().mappings).toHaveLength(1);
    expect(useMidiControllerStore.getState().mappings[0].controlNumber).toBe(7);
  });

  it('processes mapped CC message through engine', () => {
    const mapping = {
      id: 'map-1',
      deviceId: 'dev-1',
      deviceName: 'Controller',
      channel: 0,
      controlType: 'cc' as const,
      controlNumber: 7,
      targetParam: 'track:t1:volume',
      targetLabel: 'Track 1 Volume',
      min: 0,
      max: 1,
    };

    useMidiControllerStore.setState({
      enabled: true,
      mappings: [mapping],
    });

    renderHook(() => useMidiController());

    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;

    messageHandler({
      deviceId: 'dev-1',
      channel: 0,
      type: 'cc',
      control: 7,
      value: 100,
      timestamp: 2000,
    });

    expect(mockProcessMessage).toHaveBeenCalledWith(
      expect.objectContaining({ control: 7, value: 100 }),
      mapping,
    );
  });

  it('routes noteOff messages so note mappings can release toggle gates', () => {
    const mapping = {
      id: 'map-note',
      deviceId: 'dev-1',
      deviceName: 'Controller',
      channel: 0,
      controlType: 'note' as const,
      controlNumber: 60,
      targetParam: 'track:t1:mute',
      targetLabel: 'Track 1 Mute',
      min: 0,
      max: 1,
    };

    useMidiControllerStore.setState({
      enabled: true,
      mappings: [mapping],
    });

    renderHook(() => useMidiController());

    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;
    const noteOff: MidiMessage = {
      deviceId: 'dev-1',
      channel: 0,
      type: 'noteOff',
      control: 60,
      value: 0,
      timestamp: 2100,
    };

    messageHandler(noteOff);

    expect(mockProcessMessage).toHaveBeenCalledWith(noteOff, mapping);
  });

  it('ignores noteOff messages for continuous note mappings', () => {
    const mapping = {
      id: 'map-note-volume',
      deviceId: 'dev-1',
      deviceName: 'Controller',
      channel: 0,
      controlType: 'note' as const,
      controlNumber: 60,
      targetParam: 'master:volume',
      targetLabel: 'Master Volume',
      min: 0,
      max: 1,
    };

    useMidiControllerStore.setState({
      enabled: true,
      mappings: [mapping],
    });

    renderHook(() => useMidiController());

    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;
    messageHandler({
      deviceId: 'dev-1',
      channel: 0,
      type: 'noteOff',
      control: 60,
      value: 0,
      timestamp: 2200,
    });

    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  it('edge-detects track mute and solo mappings instead of repeatedly toggling above threshold', () => {
    useProjectStore.getState().createProject({ name: 'MIDI Test', bpm: 120 });
    const track = useProjectStore.getState().addTrack('synth');
    useMidiControllerStore.setState({ enabled: true });

    renderHook(() => useMidiController());
    const trackHandler = mockRegisterHandler.mock.calls.find(([scope]) => scope === 'track')?.[1] as
      | ((target: { scope: string; trackId?: string; param: string }, value: number) => void)
      | undefined;

    trackHandler?.({ scope: 'track', trackId: track.id, param: 'mute' }, 0.75);
    trackHandler?.({ scope: 'track', trackId: track.id, param: 'mute' }, 0.95);
    expect(useProjectStore.getState().project?.tracks.find((t) => t.id === track.id)?.muted).toBe(true);

    trackHandler?.({ scope: 'track', trackId: track.id, param: 'mute' }, 0.1);
    trackHandler?.({ scope: 'track', trackId: track.id, param: 'mute' }, 0.8);
    expect(useProjectStore.getState().project?.tracks.find((t) => t.id === track.id)?.muted).toBe(false);
  });

  it('only applies master volume mappings to masterVolume', () => {
    useProjectStore.getState().createProject({ name: 'MIDI Test', bpm: 120 });
    useProjectStore.getState().updateProject({ masterVolume: 0.8 });
    useMidiControllerStore.setState({ enabled: true });

    renderHook(() => useMidiController());
    const masterHandler = mockRegisterHandler.mock.calls.find(([scope]) => scope === 'master')?.[1] as
      | ((target: { scope: string; param: string }, value: number) => void)
      | undefined;

    masterHandler?.({ scope: 'master', param: 'pan' }, 0.2);
    expect(useProjectStore.getState().project?.masterVolume).toBe(0.8);

    masterHandler?.({ scope: 'master', param: 'volume' }, 0.2);
    expect(useProjectStore.getState().project?.masterVolume).toBe(0.2);
  });

  it('ignores messages with no matching mapping', () => {
    useMidiControllerStore.setState({
      enabled: true,
      mappings: [],
    });

    renderHook(() => useMidiController());

    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;

    messageHandler({
      deviceId: 'dev-1',
      channel: 0,
      type: 'cc',
      control: 99,
      value: 50,
      timestamp: 3000,
    });

    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  it('updates last activity on every message', () => {
    useMidiControllerStore.setState({ enabled: true });
    renderHook(() => useMidiController());

    const messageHandler = mockOnMessage.mock.calls[0][0] as (msg: MidiMessage) => void;

    messageHandler({
      deviceId: 'dev-1',
      channel: 0,
      type: 'cc',
      control: 1,
      value: 50,
      timestamp: 5000,
    });

    expect(useMidiControllerStore.getState().lastActivity).toBeDefined();
    expect(useMidiControllerStore.getState().lastActivity?.timestamp).toBe(5000);
  });
});
