/**
 * Tests for the code diff utility.
 */
import { describe, it, expect } from 'vitest';
import { computeLineDiff, formatDiffSummary, type DiffLine } from '../codeDiff';

describe('codeDiff', () => {
  describe('computeLineDiff', () => {
    it('returns empty diff for identical code', () => {
      const diff = computeLineDiff('s("bd sd")', 's("bd sd")');
      expect(diff.every((l) => l.type === 'unchanged')).toBe(true);
    });

    it('detects added lines', () => {
      const diff = computeLineDiff(
        's("bd sd")',
        's("bd sd")\n.bank("tr909")',
      );
      const added = diff.filter((l) => l.type === 'added');
      expect(added.length).toBe(1);
      expect(added[0].content).toBe('.bank("tr909")');
    });

    it('detects removed lines', () => {
      const diff = computeLineDiff(
        's("bd sd")\n.bank("tr909")',
        's("bd sd")',
      );
      const removed = diff.filter((l) => l.type === 'removed');
      expect(removed.length).toBe(1);
      expect(removed[0].content).toBe('.bank("tr909")');
    });

    it('detects changed lines', () => {
      const diff = computeLineDiff(
        's("bd sd")',
        's("bd hh")',
      );
      const removed = diff.filter((l) => l.type === 'removed');
      const added = diff.filter((l) => l.type === 'added');
      expect(removed.length).toBe(1);
      expect(added.length).toBe(1);
    });

    it('handles empty strings', () => {
      const diff = computeLineDiff('', 's("bd sd")');
      expect(diff.filter((l) => l.type === 'added').length).toBe(1);
    });

    it('returns empty diff for both empty strings', () => {
      const diff = computeLineDiff('', '');
      expect(diff.length).toBe(0);
    });

    it('handles multiline code', () => {
      const before = `stack(
  s("bd sd"),
  note("c3 e3")
)`;
      const after = `stack(
  s("bd hh"),
  note("c3 e3"),
  note("g4 a4")
)`;
      const diff = computeLineDiff(before, after);
      const added = diff.filter((l) => l.type === 'added');
      const removed = diff.filter((l) => l.type === 'removed');
      expect(added.length).toBeGreaterThan(0);
      expect(removed.length).toBeGreaterThan(0);
    });
  });

  describe('formatDiffSummary', () => {
    it('returns human-readable summary', () => {
      const diff: DiffLine[] = [
        { type: 'unchanged', content: 'stack(' },
        { type: 'removed', content: '  s("bd sd"),' },
        { type: 'added', content: '  s("bd hh"),' },
        { type: 'unchanged', content: ')' },
      ];
      const summary = formatDiffSummary(diff);
      expect(summary).toContain('1 added');
      expect(summary).toContain('1 removed');
    });

    it('handles no changes', () => {
      const diff: DiffLine[] = [
        { type: 'unchanged', content: 's("bd sd")' },
      ];
      const summary = formatDiffSummary(diff);
      expect(summary).toContain('no changes');
    });
  });
});
