import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrooveTemplatesPanel } from '../GrooveTemplatesPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import type { Project, GrooveTemplate } from '../../../types/project';

function makeGroove(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
  return {
    id: overrides.id ?? 'groove-1',
    name: overrides.name ?? 'Swing 16ths',
    timingOffsets: [0, 0.02, 0, 0.03],
    velocityPattern: [1.2, 0.8, 1.0, 0.7],
    gridBeats: 0.25,
    lengthBeats: 1,
    createdAt: Date.now(),
    ...overrides,
  };
}

function setupProject(groovePool: GrooveTemplate[] = []) {
  useProjectStore.setState({
    project: {
      id: 'p',
      name: 'Test',
      tracks: [],
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
      markers: [],
      tempoMap: [],
      timeSignatureMap: [],
      groovePool,
    } as unknown as Project,
  });
}

describe('GrooveTemplatesPanel', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useUIStore.setState({ grooveStrength: 100 });
  });

  it('renders empty state when no grooves exist', () => {
    setupProject([]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/no groove templates/i)).toBeTruthy();
  });

  it('lists groove templates by name', () => {
    setupProject([
      makeGroove({ id: 'g1', name: 'Swing 16ths' }),
      makeGroove({ id: 'g2', name: 'Laid Back 8ths' }),
    ]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText('Swing 16ths')).toBeTruthy();
    expect(screen.getByText('Laid Back 8ths')).toBeTruthy();
  });

  it('displays grid and length info for each groove', () => {
    setupProject([makeGroove({ gridBeats: 0.25, lengthBeats: 4 })]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/1\/16/)).toBeTruthy(); // 0.25 = 16th note
    expect(screen.getByText(/4 beats/i)).toBeTruthy();
  });

  it('calls deleteGrooveTemplate when delete button is clicked', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    const deleteGrooveTemplate = vi.fn();
    useProjectStore.setState({ deleteGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete groove/i }));
    expect(deleteGrooveTemplate).toHaveBeenCalledWith('g1');
  });

  it('enters rename mode on double-click and saves on Enter', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Swing 16ths' })]);
    const renameGrooveTemplate = vi.fn();
    useProjectStore.setState({ renameGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.doubleClick(screen.getByText('Swing 16ths'));

    const input = screen.getByDisplayValue('Swing 16ths');
    fireEvent.change(input, { target: { value: 'Funky Groove' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameGrooveTemplate).toHaveBeenCalledWith('g1', 'Funky Groove');
  });

  it('cancels rename on Escape', () => {
    setupProject([makeGroove({ id: 'g1', name: 'Swing 16ths' })]);
    const renameGrooveTemplate = vi.fn();
    useProjectStore.setState({ renameGrooveTemplate });

    render(<GrooveTemplatesPanel />);
    fireEvent.doubleClick(screen.getByText('Swing 16ths'));

    const input = screen.getByDisplayValue('Swing 16ths');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(renameGrooveTemplate).not.toHaveBeenCalled();
    // Original name should still be visible
    expect(screen.getByText('Swing 16ths')).toBeTruthy();
  });

  it('renders Apply button on each groove row', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByRole('button', { name: /apply groove/i })).toBeTruthy();
  });

  it('calls applyGrooveToClip when Apply is clicked with open clip', () => {
    setupProject([makeGroove({ id: 'g1' })]);
    const applyGrooveToClip = vi.fn();
    useProjectStore.setState({ applyGrooveToClip });
    useUIStore.setState({
      openPianoRollClipId: 'clip-1',
      selectedPianoRollNoteIds: ['note-1', 'note-2'],
      grooveStrength: 75,
    });

    render(<GrooveTemplatesPanel />);
    fireEvent.click(screen.getByRole('button', { name: /apply groove/i }));
    expect(applyGrooveToClip).toHaveBeenCalledWith('clip-1', ['note-1', 'note-2'], 'g1', { strength: 75 });
  });

  it('shows strength slider defaulting to 100', () => {
    setupProject([makeGroove()]);
    render(<GrooveTemplatesPanel />);
    const slider = screen.getByRole('slider', { name: /strength/i });
    expect(slider).toBeTruthy();
    expect((slider as HTMLInputElement).value).toBe('100');
  });

  it('formats grid size to musical notation', () => {
    setupProject([
      makeGroove({ id: 'g1', gridBeats: 1, name: 'Quarter' }),
      makeGroove({ id: 'g2', gridBeats: 0.5, name: 'Eighth' }),
      makeGroove({ id: 'g3', gridBeats: 0.25, name: 'Sixteenth' }),
    ]);
    render(<GrooveTemplatesPanel />);
    expect(screen.getByText(/1\/4/)).toBeTruthy();
    expect(screen.getByText(/1\/8/)).toBeTruthy();
    expect(screen.getByText(/1\/16/)).toBeTruthy();
  });
});
