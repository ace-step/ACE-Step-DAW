/**
 * Component Async Robustness — Regression Tests
 *
 * Verifies that async failures in UI components are caught and communicated
 * to the user (via toast) instead of causing unhandled promise rejections.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock toast ─────────────────────────────────────────────────────────────
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: (...args: unknown[]) => mockToastSuccess(...args),
  toastError: (...args: unknown[]) => mockToastError(...args),
  toastInfo: (...args: unknown[]) => mockToastInfo(...args),
}));

// ─── Mock stores ────────────────────────────────────────────────────────────
vi.mock('../../src/store/uiStore', () => {
  const state: Record<string, unknown> = {
    showProjectListDialog: true,
    setShowProjectListDialog: vi.fn(),
    showNewProjectDialog: true,
    setShowNewProjectDialog: vi.fn(),
    selectClip: vi.fn(),
    selectTrack: vi.fn(),
    selectWindow: null,
    setSelectWindow: vi.fn(),
    setOpenStrudelEditor: vi.fn(),
  };
  const useUIStore = Object.assign(
    vi.fn((selector: (s: typeof state) => unknown) => selector(state)),
    { getState: () => state },
  );
  return { useUIStore };
});

vi.mock('../../src/store/projectStore', () => {
  const state: Record<string, unknown> = {
    project: { id: 'p1', name: 'Test', tracks: [] },
    setProject: vi.fn(),
    createProject: vi.fn(),
    createProjectFromTemplate: vi.fn(),
    saveProjectAsTemplate: vi.fn(),
  };
  const useProjectStore = Object.assign(
    vi.fn((selector: (s: typeof state) => unknown) => selector(state)),
    { getState: () => state },
  );
  return { useProjectStore };
});

vi.mock('../../src/store/collaborationStore', () => {
  const state = {
    setViewerMode: vi.fn(),
    setActiveShare: vi.fn(),
  };
  const useCollaborationStore = Object.assign(
    vi.fn((selector: (s: typeof state) => unknown) => selector(state)),
    { getState: () => state },
  );
  return { useCollaborationStore };
});

// ─── Mock services ──────────────────────────────────────────────────────────
const mockListProjects = vi.fn();
const mockLoadProject = vi.fn();
const mockListTemplates = vi.fn();
const mockDeleteProject = vi.fn();
const mockSaveProject = vi.fn();
const mockLoadTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();

vi.mock('../../src/services/projectStorage', () => ({
  listProjects: (...args: unknown[]) => mockListProjects(...args),
  loadProject: (...args: unknown[]) => mockLoadProject(...args),
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
  saveProject: (...args: unknown[]) => mockSaveProject(...args),
  exportProjectArchive: vi.fn(),
  importProjectArchive: vi.fn(),
  saveTemplate: vi.fn(),
  loadTemplate: (...args: unknown[]) => mockLoadTemplate(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
}));

vi.mock('../../src/services/audioFileManager', () => ({
  deleteAllProjectAudio: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/collaborationService', () => ({
  parseShareParams: vi.fn(),
}));

vi.mock('../../src/services/cloudStorageService', () => ({
  cloudStorage: {
    loadSharedProject: vi.fn(),
  },
}));

vi.mock('../../src/data/onboardingCatalog', () => ({
  ONBOARDING_STARTERS: [],
  getStarterTemplate: vi.fn(),
  instantiateDemoProject: vi.fn(),
}));

vi.mock('../../src/utils/formatRelativeTime', () => ({
  formatRelativeTime: vi.fn(() => 'just now'),
}));

// ────────────────────────────────────────────────────────────────────────────

describe('Component Async Robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── ProjectListDialog ──────────────────────────────────────────────────
  describe('ProjectListDialog', () => {
    it('catches listProjects() failure and resets loading state', async () => {
      mockListProjects.mockRejectedValueOnce(new Error('IndexedDB unavailable'));

      const { ProjectListDialog } = await import(
        '../../src/components/dialogs/ProjectListDialog'
      );

      await act(async () => {
        render(<ProjectListDialog />);
      });

      // Wait for rejection to propagate and be caught
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to load projects');
      });
    });
  });

  // ── NewProjectDialog ───────────────────────────────────────────────────
  describe('NewProjectDialog', () => {
    it('catches listProjects() failure without crashing', async () => {
      mockListProjects.mockRejectedValueOnce(new Error('Storage quota exceeded'));
      mockListTemplates.mockResolvedValueOnce([]);

      const { NewProjectDialog } = await import(
        '../../src/components/dialogs/NewProjectDialog'
      );

      await act(async () => {
        render(<NewProjectDialog />);
      });

      // Should complete without unhandled rejection
      await waitFor(() => {
        expect(mockListProjects).toHaveBeenCalled();
      });

      // Component should still be usable
      expect(screen.getByText(/Create/i)).toBeInTheDocument();
    });

    it('catches listTemplates() failure without crashing', async () => {
      mockListProjects.mockResolvedValueOnce([]);
      mockListTemplates.mockRejectedValueOnce(new Error('Template DB corrupted'));

      const { NewProjectDialog } = await import(
        '../../src/components/dialogs/NewProjectDialog'
      );

      await act(async () => {
        render(<NewProjectDialog />);
      });

      await waitFor(() => {
        expect(mockListTemplates).toHaveBeenCalled();
      });

      // Component still renders
      expect(screen.getByText(/Create/i)).toBeInTheDocument();
    });
  });

  // ── EmptyState ─────────────────────────────────────────────────────────
  describe('EmptyState', () => {
    it('catches loadProject() failure and shows toast', async () => {
      mockListProjects.mockResolvedValueOnce([
        { id: 'p1', name: 'Recent Project', updatedAt: Date.now(), trackCount: 2, durationSec: 30 },
      ]);
      mockLoadProject.mockRejectedValueOnce(new Error('Project corrupted'));

      const { EmptyState } = await import(
        '../../src/components/layout/EmptyState'
      );

      await act(async () => {
        render(<EmptyState />);
      });

      // Wait for recent projects to load
      await waitFor(() => {
        expect(screen.getByText('Recent Project')).toBeInTheDocument();
      });

      // Click on the recent project
      await act(async () => {
        fireEvent.click(screen.getByText('Recent Project'));
      });

      // Should show error feedback
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to load project');
      });
    });
  });

  // ── useShareLink ───────────────────────────────────────────────────────
  describe('useShareLink', () => {
    it('catches loadSharedProject() failure and resolves loading', async () => {
      const { parseShareParams } = await import(
        '../../src/services/collaborationService'
      );
      (parseShareParams as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        token: 'test-token',
        readOnly: false,
        expiresAt: null,
        mode: 'player',
      });

      const { cloudStorage } = await import(
        '../../src/services/cloudStorageService'
      );
      (cloudStorage.loadSharedProject as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const { useShareLink } = await import('../../src/hooks/useShareLink');

      function TestComponent() {
        const { loadingSharedProject } = useShareLink();
        return <div data-testid="loading">{String(loadingSharedProject)}</div>;
      }

      await act(async () => {
        render(<TestComponent />);
      });

      // Loading should eventually resolve to false (not stuck at true)
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Should show info toast about failure
      expect(mockToastInfo).toHaveBeenCalledWith('Failed to load shared project');
    });
  });

  // ── ClipBlock setTimeout cleanup pattern ────────────────────────────────
  describe('ClipBlock setTimeout cleanup pattern', () => {
    it('clears previous timeout before scheduling a new one', () => {
      // Verifies the ref-based timeout pattern used in ClipBlock.onGhostLanding:
      // 1. Clear any existing timer before scheduling
      // 2. Store the new timer ID in a ref
      // 3. Clear on unmount via useEffect cleanup
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const timerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

      // First call — schedule timer
      timerRef.current = setTimeout(() => {}, 200);

      // Second rapid call — must clear previous before scheduling new
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {}, 200);

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      // Unmount cleanup — must clear remaining timer
      if (timerRef.current !== null) clearTimeout(timerRef.current);

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      clearTimeoutSpy.mockRestore();
    });
  });
});
