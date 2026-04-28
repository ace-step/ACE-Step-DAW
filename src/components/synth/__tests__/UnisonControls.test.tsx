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
    screen.getByText('Voices'); // getBy* throws if not found
    screen.getByText('Detune');
    screen.getByText('Spread');
  });

  it('displays current values', () => {
    const settings: UnisonSettings = { voices: 4, detune: 50, spread: 0.7 };
    render(<UnisonControls settings={settings} onChange={mockOnChange} />);
    screen.getByText('4'); // getBy* throws if not found
    screen.getByText('50 ct');
    screen.getByText('70%');
  });

  it('renders with data-testid for automation', () => {
    const { container } = render(
      <UnisonControls settings={defaultSettings} onChange={mockOnChange} />,
    );
    expect(container.querySelector('[data-testid="unison-controls"]')).not.toBeNull();
  });
});
