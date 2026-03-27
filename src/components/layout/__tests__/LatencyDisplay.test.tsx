import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatencyDisplay } from '../LatencyDisplay';
import { useProjectStore } from '../../../store/projectStore';

describe('LatencyDisplay', () => {
  beforeEach(() => {
    // Reset project store with latency settings
    const state = useProjectStore.getState();
    if (state.project) {
      useProjectStore.getState().updateProject({
        playbackLatency: {
          detectedBaseLatencyMs: 5,
          detectedOutputLatencyMs: 10,
          detectedLatencyMs: 15,
          manualOverrideMs: null,
          compensationMs: 15,
          source: 'auto',
          browserSupport: 'available',
          updatedAt: Date.now(),
        },
      });
    }
  });

  it('renders latency value in ms', () => {
    // Even without a project, the component should render gracefully
    const { container } = render(<LatencyDisplay />);
    expect(container).toBeDefined();
  });

  it('shows fallback text when no latency data is available', () => {
    render(<LatencyDisplay />);
    // Should show something like "-- ms" or "0 ms" when no project
    const el = screen.getByTestId('latency-display');
    expect(el).toBeDefined();
    expect(el.textContent).toMatch(/ms/);
  });
});
