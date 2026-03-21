import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackListDisplayToggle } from '../../src/components/tracks/TrackListDisplayToggle';
import { useUIStore } from '../../src/store/uiStore';

describe('TrackListDisplayToggle', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('toggles between expanded and collapsed track-list states', () => {
    render(<TrackListDisplayToggle />);

    const toggle = screen.getByTestId('track-list-display-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Collapse track list');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);

    expect(useUIStore.getState().trackListDisplayMode).toBe('collapsed');
    expect(screen.getByTestId('track-list-display-toggle')).toHaveAttribute('aria-label', 'Expand track list');
    expect(screen.getByTestId('track-list-display-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});
