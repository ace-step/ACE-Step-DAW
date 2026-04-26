import { beforeEach, describe, expect, it } from 'vitest';
import { useTransportStore } from '../../src/store/transportStore';

describe('Punch Recording Controls - Store', () => {
  beforeEach(() => {
    useTransportStore.setState(useTransportStore.getInitialState(), true);
  });

  it('punch is disabled by default', () => {
    expect(useTransportStore.getState().punchEnabled).toBe(false);
  });

  it('punchInTime and punchOutTime default to null', () => {
    expect(useTransportStore.getState().punchInTime).toBeNull();
    expect(useTransportStore.getState().punchOutTime).toBeNull();
  });

  it('togglePunch enables and disables punch mode', () => {
    useTransportStore.getState().togglePunch();
    expect(useTransportStore.getState().punchEnabled).toBe(true);
    useTransportStore.getState().togglePunch();
    expect(useTransportStore.getState().punchEnabled).toBe(false);
  });

  it('setPunchIn sets the punch-in time', () => {
    useTransportStore.getState().setPunchIn(5.0);
    expect(useTransportStore.getState().punchInTime).toBe(5.0);
  });

  it('setPunchOut sets the punch-out time', () => {
    useTransportStore.getState().setPunchOut(15.0);
    expect(useTransportStore.getState().punchOutTime).toBe(15.0);
  });

  it('setPunchRange sets both times and enables punch', () => {
    useTransportStore.getState().setPunchRange(2.0, 10.0);
    expect(useTransportStore.getState().punchInTime).toBe(2.0);
    expect(useTransportStore.getState().punchOutTime).toBe(10.0);
    expect(useTransportStore.getState().punchEnabled).toBe(true);
  });
});
