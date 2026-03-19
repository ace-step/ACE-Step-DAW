import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from '../../src/store/transportStore';

describe('Punch In/Out', () => {
  beforeEach(() => {
    useTransportStore.setState({
      punchInTime: null,
      punchOutTime: null,
      punchEnabled: false,
      currentTime: 0,
    });
  });

  it('setPunchIn stores the punch-in time', () => {
    useTransportStore.getState().setPunchIn(5.0);
    expect(useTransportStore.getState().punchInTime).toBe(5.0);
  });

  it('setPunchOut stores the punch-out time', () => {
    useTransportStore.getState().setPunchOut(12.5);
    expect(useTransportStore.getState().punchOutTime).toBe(12.5);
  });

  it('togglePunch toggles punchEnabled', () => {
    expect(useTransportStore.getState().punchEnabled).toBe(false);
    useTransportStore.getState().togglePunch();
    expect(useTransportStore.getState().punchEnabled).toBe(true);
    useTransportStore.getState().togglePunch();
    expect(useTransportStore.getState().punchEnabled).toBe(false);
  });
});
