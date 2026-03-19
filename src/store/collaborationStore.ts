import { create } from 'zustand';

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  isOwner: boolean;
  joinedAt: number;
}

export interface CollaborationState {
  /** Whether the current session is in read-only viewer mode. */
  isViewerMode: boolean;
  /** Whether a share dialog is currently open. */
  showShareDialog: boolean;
  /** The active share token, if the project is currently shared. */
  activeShareToken: string | null;
  /** The active share URL, if the project is currently shared. */
  activeShareUrl: string | null;
  /** Connected collaborators (Phase 3 — stubbed for now). */
  collaborators: Collaborator[];
  /** Whether the project has unsaved cloud changes (Phase 2). */
  hasCloudChanges: boolean;

  // Actions
  setViewerMode: (v: boolean) => void;
  setShowShareDialog: (v: boolean) => void;
  setActiveShare: (token: string | null, url: string | null) => void;
  setCollaborators: (collaborators: Collaborator[]) => void;
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (id: string) => void;
  setHasCloudChanges: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  isViewerMode: false,
  showShareDialog: false,
  activeShareToken: null as string | null,
  activeShareUrl: null as string | null,
  collaborators: [] as Collaborator[],
  hasCloudChanges: false,
};

export const useCollaborationStore = create<CollaborationState>()((set) => ({
  ...initialState,

  setViewerMode: (v) => set({ isViewerMode: v }),
  setShowShareDialog: (v) => set({ showShareDialog: v }),
  setActiveShare: (token, url) => set({ activeShareToken: token, activeShareUrl: url }),
  setCollaborators: (collaborators) => set({ collaborators }),
  addCollaborator: (collaborator) =>
    set((s) => ({ collaborators: [...s.collaborators, collaborator] })),
  removeCollaborator: (id) =>
    set((s) => ({ collaborators: s.collaborators.filter((c) => c.id !== id) })),
  setHasCloudChanges: (v) => set({ hasCloudChanges: v }),
  reset: () => set(initialState),
}));
