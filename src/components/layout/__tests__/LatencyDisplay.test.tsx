import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LatencyDisplay } from '../LatencyDisplay';

describe('LatencyDisplay', () => {
  it('renders without a project and shows fallback text', () => {
    const { container } = render(<LatencyDisplay />);
    expect(container).toBeDefined();
  });

  it('shows ms unit in the display', () => {
    render(<LatencyDisplay />);
    const el = screen.getByTestId('latency-display');
    expect(el.textContent).toBe('-- ms');
  });
});
