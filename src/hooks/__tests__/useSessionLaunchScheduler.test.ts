/**
 * Tests for useSessionLaunchScheduler hook — session clip launch timing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useSessionLaunchScheduler } from '../useSessionLaunchScheduler';

describe('useSessionLaunchScheduler', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Test' });
  });

  it('calls commitPendingSessionLaunches on mount', () => {
    const spy = vi.spyOn(useProjectStore.getState(), 'commitPendingSessionLaunches');

    renderHook(() => useSessionLaunchScheduler());

    expect(spy).toHaveBeenCalledWith(0); // initial currentTime is 0
    spy.mockRestore();
  });

  it('calls commitPendingSessionLaunches when currentTime changes', () => {
    const spy = vi.spyOn(useProjectStore.getState(), 'commitPendingSessionLaunches');

    renderHook(() => useSessionLaunchScheduler());

    act(() => {
      useTransportStore.setState({ currentTime: 5.0 });
    });

    expect(spy).toHaveBeenCalledWith(5.0);
    spy.mockRestore();
  });
});
