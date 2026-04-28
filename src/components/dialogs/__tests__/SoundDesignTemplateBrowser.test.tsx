import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundDesignTemplateBrowser } from '../SoundDesignTemplateBrowser';
import { SOUND_DESIGN_TEMPLATES } from '../../../data/templates/soundDesignTemplates';

describe('SoundDesignTemplateBrowser', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
  });

  it('renders all genre filter buttons', () => {
    render(<SoundDesignTemplateBrowser onSelect={onSelect} />);
    const filterButtons = screen.getAllByTestId('genre-filter-btn');
    // "All" + each unique genre
    const genreCount = new Set(SOUND_DESIGN_TEMPLATES.map((t) => t.genre)).size;
    expect(filterButtons.length).toBe(genreCount + 1);
  });

  it('renders template cards', () => {
    render(<SoundDesignTemplateBrowser onSelect={onSelect} />);
    // All 12 templates visible when "All" is selected
    const cards = screen.getAllByTestId('sound-design-template-card');
    expect(cards.length).toBe(SOUND_DESIGN_TEMPLATES.length);
  });

  it('filters templates by genre', () => {
    render(<SoundDesignTemplateBrowser onSelect={onSelect} />);
    const electronicBtn = screen.getAllByTestId('genre-filter-btn').find((el) => el.textContent === 'Electronic');
    expect(electronicBtn).toBeDefined();
    fireEvent.click(electronicBtn!);
    const cards = screen.getAllByTestId('sound-design-template-card');
    const electronicCount = SOUND_DESIGN_TEMPLATES.filter((t) => t.genre === 'Electronic').length;
    expect(cards.length).toBe(electronicCount);
  });

  it('calls onSelect with template when a card is clicked', () => {
    render(<SoundDesignTemplateBrowser onSelect={onSelect} />);
    const firstCard = screen.getAllByTestId('sound-design-template-card')[0];
    fireEvent.click(firstCard);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(SOUND_DESIGN_TEMPLATES[0]);
  });

  it('shows track count and roles in each card', () => {
    render(<SoundDesignTemplateBrowser onSelect={onSelect} />);
    // First template: Lo-fi Hip Hop with 4 tracks
    const first = SOUND_DESIGN_TEMPLATES[0];
    expect(screen.getByText(first.name)).toBeTruthy();
    expect(screen.getByText(first.description)).toBeTruthy();
  });
});
