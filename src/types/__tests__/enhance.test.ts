import { describe, it, expect } from 'vitest';
import type { EnhancementNode, EnhancementSession } from '../enhance';

describe('Enhancement types', () => {
  it('EnhancementNode conforms to expected shape', () => {
    const node: EnhancementNode = {
      id: 'enh-1',
      parentId: null,
      clipId: 'clip-1',
      audioKey: 'audio-key-1',
      mode: 'cover',
      params: {
        caption: 'jazz cover',
        lyrics: 'some lyrics',
        coverStrength: 0.5,
      },
      createdAt: Date.now(),
      label: 'Enhancement 1',
    };
    expect(node.id).toBe('enh-1');
    expect(node.parentId).toBeNull();
    expect(node.mode).toBe('cover');
    expect(node.params.caption).toBe('jazz cover');
  });

  it('EnhancementNode supports repaint mode with range params', () => {
    const node: EnhancementNode = {
      id: 'enh-2',
      parentId: 'enh-1',
      clipId: 'clip-1',
      audioKey: 'audio-key-2',
      mode: 'repaint',
      params: {
        repaintRange: { start: 2, end: 5 },
        repaintMode: 'balanced',
        repaintStrength: 0.7,
      },
      createdAt: Date.now(),
      label: 'Repaint bars 5-8',
    };
    expect(node.parentId).toBe('enh-1');
    expect(node.mode).toBe('repaint');
    expect(node.params.repaintRange).toEqual({ start: 2, end: 5 });
  });

  it('EnhancementSession has flat node list with tree via parentId', () => {
    const nodes: EnhancementNode[] = [
      {
        id: 'enh-1',
        parentId: null,
        clipId: 'clip-1',
        audioKey: 'audio-1',
        mode: 'cover',
        params: { caption: 'jazz' },
        createdAt: 1000,
        label: 'v1',
      },
      {
        id: 'enh-2',
        parentId: 'enh-1',
        clipId: 'clip-1',
        audioKey: 'audio-2',
        mode: 'cover',
        params: { caption: 'add reverb' },
        createdAt: 2000,
        label: 'v2',
      },
      {
        id: 'enh-3',
        parentId: 'enh-1',
        clipId: 'clip-1',
        audioKey: 'audio-3',
        mode: 'repaint',
        params: { repaintRange: { start: 5, end: 8 } },
        createdAt: 3000,
        label: 'v3',
      },
    ];

    const session: EnhancementSession = {
      id: 'session-1',
      clipId: 'clip-1',
      nodes,
      activeNodeId: 'enh-2',
    };

    expect(session.nodes).toHaveLength(3);
    expect(session.activeNodeId).toBe('enh-2');

    // Tree structure: enh-1 is root, enh-2 and enh-3 are children of enh-1
    const roots = session.nodes.filter((n) => n.parentId === null);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('enh-1');

    const childrenOfRoot = session.nodes.filter((n) => n.parentId === 'enh-1');
    expect(childrenOfRoot).toHaveLength(2);
  });
});
