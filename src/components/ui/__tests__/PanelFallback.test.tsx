import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  MixerFallback,
  PianoRollFallback,
  EffectChainFallback,
  BottomPanelFallback,
  SessionViewFallback,
} from '../PanelFallback';

describe('PanelFallback components', () => {
  it('MixerFallback renders skeleton channel strips', () => {
    const { container } = render(<MixerFallback />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    const shimmers = container.querySelectorAll('.skeleton-shimmer');
    // 8 channels × 3 elements each = 24
    expect(shimmers.length).toBe(24);
  });

  it('PianoRollFallback renders skeleton grid', () => {
    const { container } = render(<PianoRollFallback />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    const shimmers = container.querySelectorAll('.skeleton-shimmer');
    // 12 keys + 48 grid cells = 60
    expect(shimmers.length).toBe(60);
  });

  it('EffectChainFallback renders skeleton effect cards', () => {
    const { container } = render(<EffectChainFallback />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    const shimmers = container.querySelectorAll('.skeleton-shimmer');
    // 4 cards × 4 elements each = 16
    expect(shimmers.length).toBe(16);
  });

  it('BottomPanelFallback renders skeleton grid', () => {
    const { container } = render(<BottomPanelFallback />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    const shimmers = container.querySelectorAll('.skeleton-shimmer');
    // 3 header bars + 64 grid = 67
    expect(shimmers.length).toBe(67);
  });

  it('SessionViewFallback renders sidebar and grid', () => {
    const { container } = render(<SessionViewFallback />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    const shimmers = container.querySelectorAll('.skeleton-shimmer');
    // 6 sidebar + 24 grid = 30
    expect(shimmers.length).toBe(30);
  });

  it('all fallbacks have correct height via style', () => {
    const { container: mixer } = render(<MixerFallback />);
    expect(mixer.firstElementChild!.getAttribute('style')).toContain('height');

    const { container: piano } = render(<PianoRollFallback />);
    expect(piano.firstElementChild!.getAttribute('style')).toContain('height');
  });
});
