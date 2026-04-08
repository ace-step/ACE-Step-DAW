import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkipLinks } from '../ui/SkipLinks';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Skip Navigation Links', () => {
  it('renders skip links for main content, timeline, and mixer', () => {
    render(<SkipLinks />);

    const nav = screen.getByRole('navigation', { name: /skip/i });
    expect(nav).toBeDefined();

    const links = nav.querySelectorAll('a');
    expect(links.length).toBeGreaterThanOrEqual(3);

    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('#main-content');
    expect(hrefs).toContain('#timeline-region');
    expect(hrefs).toContain('#mixer-region');
  });
});
