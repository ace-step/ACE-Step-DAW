/**
 * Types for the iterative enhancement workflow.
 * Supports chaining enhancement results as new sources,
 * building a version tree of enhancements.
 */

export interface EnhancementNode {
  id: string;
  parentId: string | null;    // null = original source
  clipId: string;
  audioKey: string;           // IndexedDB key for this version's audio
  mode: 'cover' | 'repaint';
  params: {
    caption?: string;
    lyrics?: string;
    coverStrength?: number;
    repaintRange?: { start: number; end: number };
    repaintMode?: string;
    repaintStrength?: number;
  };
  createdAt: number;
  label: string;              // "Enhancement 1", user-editable
}

export interface EnhancementSession {
  id: string;
  clipId: string;             // original source clip
  nodes: EnhancementNode[];   // flat list, tree via parentId
  activeNodeId: string | null; // currently selected version
}
