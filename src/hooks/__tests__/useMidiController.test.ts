import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMidiController } from '../useMidiController';
import { useMidiControllerStore } from '../../store/midiControllerStore';
import { useProjectStore } from '../../store/projectStore';
import type { MidiMessage } from '../../types/midiController';

// Mock WebMidiService
const mockConnect = vi.fn().mockResolvedValue([]);
const mockOnMessage = vi.fn(() => vi.fn());
const mockOnDeviceChange = vi.fn(() => vi.fn());

vi.mock('../../services/webMidiService', () => ({
  WebMidiService: {
    isSupported: vi.fn(() => true),
  },
  getWebMidiService: vi.fn(() => ({
    connect: mockConnect,
    onMessage: mockOnMessage,
    onDeviceChange: mockOnDeviceChange,
    destroy: vi.fn(),
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

  it('does not connect when disabled', () => {
    useMidiControllerStore.setState({ enabled: false });
    renderHook(() => useMidiController());

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('subscribes to device changes and MIDI messages', () => {
    useMidiControllerStore.setState({ enabled: true });
    renderHook(() => useMidiController());

    expect(mockOnDeviceChange).toHaveBeenCalled();
    expect(mockOnMessage).toHaveBeenCalled();
  });

  it('unsubscribes on cleanup', () => {
    useMidiControllerStore.setState({ enabled: true });
    const { unmount } = renderHook(() => useMidiController());

    unmount();
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
