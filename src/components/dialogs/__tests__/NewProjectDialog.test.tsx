import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectDialog } from '../NewProjectDialog';
import { GENRE_TEMPLATES, getGenreCategories } from '../../../data/genreTemplates';

// Mock stores
vi.mock('../../../store/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      showNewProjectDialog: true,
      setShowNewProjectDialog: vi.fn(),
    }),
  ),
}));

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      createProject: vi.fn(),
      setProject: vi.fn(),
      createProjectFromTemplate: vi.fn(),
    }),
  ),
}));

vi.mock('../../../services/projectStorage', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  loadProject: vi.fn(),
  deleteProject: vi.fn(),
  listTemplates: vi.fn().mockResolvedValue([]),
  loadTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastSuccess: vi.fn(),
}));

describe('NewProjectDialog — Genre Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Genre Templates section', () => {
    render(<NewProjectDialog />);
    expect(screen.getByText('Genre Templates')).toBeInTheDocument();
  });

  it('renders genre category tabs', () => {
    render(<NewProjectDialog />);
    const categories = getGenreCategories();
    // "All" tab plus each category
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    for (const cat of categories) {
      expect(screen.getByRole('button', { name: cat })).toBeInTheDocument();
    }
  });

  it('shows all genre templates by default (All tab)', () => {
    render(<NewProjectDialog />);
    // Each template has a data-genre-template-id attribute
    for (const entry of GENRE_TEMPLATES) {
      expect(document.querySelector(`[data-genre-template-id="${entry.id}"]`)).toBeInTheDocument();
    }
  });

  it('filters templates when a genre tab is clicked', () => {
    render(<NewProjectDialog />);
    const electronicsTab = screen.getByRole('button', { name: 'Electronic' });
    fireEvent.click(electronicsTab);
    // Electronic templates should be visible
    const electronicTemplates = GENRE_TEMPLATES.filter((t) => t.genre === 'Electronic');
    for (const entry of electronicTemplates) {
      expect(document.querySelector(`[data-genre-template-id="${entry.id}"]`)).toBeInTheDocument();
    }
    // Non-electronic templates should NOT be visible
    const nonElectronic = GENRE_TEMPLATES.filter((t) => t.genre !== 'Electronic');
    for (const entry of nonElectronic) {
      expect(document.querySelector(`[data-genre-template-id="${entry.id}"]`)).not.toBeInTheDocument();
    }
  });

  it('displays BPM and key for each genre template', () => {
    render(<NewProjectDialog />);
    const first = GENRE_TEMPLATES[0];
    expect(screen.getByText(new RegExp(`${first.bpm} BPM`))).toBeInTheDocument();
  });

  it('displays track names for each genre template', () => {
    render(<NewProjectDialog />);
    const first = GENRE_TEMPLATES[0];
    const container = document.querySelector(`[data-genre-template-id="${first.id}"]`);
    expect(container).toBeInTheDocument();
    // At least first few tracks should be shown as chips within this template
    for (const trackName of first.tracks.slice(0, 3)) {
      expect(container!.textContent).toContain(trackName);
    }
  });
});
