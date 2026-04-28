import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

const mockCreateProject = vi.fn();
const mockSetProject = vi.fn();
const mockCreateProjectFromTemplate = vi.fn();
const mockSetShowNewProjectDialog = vi.fn();

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) => {
    const state = {
      createProject: mockCreateProject,
      setProject: mockSetProject,
      createProjectFromTemplate: mockCreateProjectFromTemplate,
    };
    return selector(state);
  }),
}));

vi.mock('../../../store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      setShowNewProjectDialog: mockSetShowNewProjectDialog,
    };
    return selector(state);
  }),
}));

vi.mock('../../../services/projectStorage', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  loadProject: vi.fn().mockResolvedValue(null),
}));

describe('EmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state container', () => {
    render(<EmptyState />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows "New Project" and "Browse All" buttons', () => {
    render(<EmptyState />);
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Browse All')).toBeInTheDocument();
  });

  it('creates a blank project on "New Project" click', () => {
    render(<EmptyState />);
    fireEvent.click(screen.getByText('New Project'));
    expect(mockCreateProject).toHaveBeenCalled();
  });

  it('opens project dialog on "Browse All" click', () => {
    render(<EmptyState />);
    fireEvent.click(screen.getByText('Browse All'));
    expect(mockSetShowNewProjectDialog).toHaveBeenCalledWith(true);
  });

  it('shows quick start templates section', () => {
    render(<EmptyState />);
    expect(screen.getByText('Quick Start Templates')).toBeInTheDocument();
  });

  it('shows demo projects section', () => {
    render(<EmptyState />);
    expect(screen.getByText('Demo Projects')).toBeInTheDocument();
  });

  it('renders at least one template card', () => {
    render(<EmptyState />);
    // At least Electronic Pulse or similar should be present
    expect(screen.getByText('Electronic Pulse')).toBeInTheDocument();
  });

  it('renders demo project cards', () => {
    render(<EmptyState />);
    expect(screen.getByText('Neon Run Demo')).toBeInTheDocument();
    expect(screen.getByText('Lofi Sketch Demo')).toBeInTheDocument();
  });
});
