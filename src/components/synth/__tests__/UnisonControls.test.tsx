import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnisonControls } from '../UnisonControls';
import type { UnisonSettings } from '../../../types/project';

describe('UnisonControls', () => {
  const defaultSettings: UnisonSettings = { voices: 1, detune: 0, spread: 0 };
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders voices, detune, and spread labels', () => {
    render(<UnisonControls settings={defaultSettings} onChange={mockOnChange} />);
    expect(screen.getByText('Voices')).toBeDefined();
    expect(screen.getByText('Detune')).toBeDefined();
    expect(screen.getByText('Spread')).toBeDefined();
  });

  it('displays current values', () => {
    const settings: UnisonSettings = { voices: 4, detune: 50, spread: 0.7 };
    render(<UnisonControls settings={settings} onChange={mockOnChange} />);
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('50 ct')).toBeDefined();
    expect(screen.getByText('70%')).toBeDefined();
  });

  it('renders with data-testid for automation', () => {
    const { container } = render(
      <UnisonControls settings={defaultSettings} onChange={mockOnChange} />,
    );
    expect(container.querySelector('[data-testid="unison-controls"]')).toBeDefined();
  });
});
