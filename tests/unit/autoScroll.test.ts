import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

describe('auto-scroll state (uiStore)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
  });

  it('defaults autoScrollEnabled to true', () => {
    expect(useUIStore.getState().autoScrollEnabled).toBe(true);
  });

  it('defaults userScrolledDuringPlayback to false', () => {
    expect(useUIStore.getState().userScrolledDuringPlayback).toBe(false);
  });

  it('setAutoScrollEnabled toggles the flag', () => {
    useUIStore.getState().setAutoScrollEnabled(false);
    expect(useUIStore.getState().autoScrollEnabled).toBe(false);

    useUIStore.getState().setAutoScrollEnabled(true);
    expect(useUIStore.getState().autoScrollEnabled).toBe(true);
  });

  it('setUserScrolledDuringPlayback toggles the flag', () => {
    useUIStore.getState().setUserScrolledDuringPlayback(true);
    expect(useUIStore.getState().userScrolledDuringPlayback).toBe(true);

    useUIStore.getState().setUserScrolledDuringPlayback(false);
    expect(useUIStore.getState().userScrolledDuringPlayback).toBe(false);
  });

  it('toggleAutoScroll flips the enabled state', () => {
    expect(useUIStore.getState().autoScrollEnabled).toBe(true);
    useUIStore.getState().toggleAutoScroll();
    expect(useUIStore.getState().autoScrollEnabled).toBe(false);
    useUIStore.getState().toggleAutoScroll();
    expect(useUIStore.getState().autoScrollEnabled).toBe(true);
  });
});
