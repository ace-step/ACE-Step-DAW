import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: {} })),
  start: vi.fn(),
  Synth: vi.fn(() => ({ toDestination: vi.fn(), triggerAttackRelease: vi.fn(), dispose: vi.fn() })),
  Transport: { bpm: { value: 120 }, seconds: 0, state: 'stopped', start: vi.fn(), stop: vi.fn(), pause: vi.fn(), position: '0:0:0', schedule: vi.fn(), cancel: vi.fn() },
  Destination: { volume: { value: 0 } },
  context: { rawContext: {}, state: 'running' },
  now: vi.fn(() => 0),
}));

import { SaveStatusIndicator } from '../SaveStatusIndicator';

describe('SaveStatusIndicator', () => {
  it('renders "Saved" with a check mark for saved status', () => {
    render(<SaveStatusIndicator status="saved" />);
    const el = screen.getByTestId('save-status-indicator');
    expect(el.textContent).toContain('Saved');
  });

  it('renders "Saving..." for saving status', () => {
    render(<SaveStatusIndicator status="saving" />);
    const el = screen.getByTestId('save-status-indicator');
    expect(el.textContent).toContain('Saving');
  });

  it('renders "Unsaved" for unsaved status', () => {
    render(<SaveStatusIndicator status="unsaved" />);
    const el = screen.getByTestId('save-status-indicator');
    expect(el.textContent).toContain('Unsaved');
  });
});
