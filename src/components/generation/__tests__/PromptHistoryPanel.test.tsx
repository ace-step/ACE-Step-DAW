import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PromptHistoryPanel } from '../PromptHistoryPanel';
import { useGenerationStore } from '../../../store/generationStore';
import type { PromptHistoryEntry } from '../../../store/generationStore';

function makeEntry(overrides: Partial<PromptHistoryEntry> = {}): PromptHistoryEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    prompt: 'dreamy ambient synth pad',
    timestamp: Date.now() - 60000,
    ...overrides,
  };
}

describe('PromptHistoryPanel', () => {
  beforeEach(() => {
    useGenerationStore.setState({ promptHistory: [] });
  });

  it('renders empty state when no prompt history exists', () => {
    render(<PromptHistoryPanel />);
    expect(screen.getByText(/no prompts yet/i)).toBeInTheDocument();
  });

  it('renders prompt entries from history', () => {
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'e1', prompt: 'funky bass groove' }),
        makeEntry({ id: 'e2', prompt: 'ethereal choir vocals' }),
      ],
    });
    render(<PromptHistoryPanel />);
    expect(screen.getByText('funky bass groove')).toBeInTheDocument();
    expect(screen.getByText('ethereal choir vocals')).toBeInTheDocument();
  });

  it('shows most recent prompts first', () => {
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'old', prompt: 'old prompt', timestamp: 1000 }),
        makeEntry({ id: 'new', prompt: 'new prompt', timestamp: 2000 }),
      ],
    });
    render(<PromptHistoryPanel />);
    const items = screen.getAllByTestId(/^prompt-history-item-/);
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('new prompt')).toBeInTheDocument();
    expect(within(items[1]).getByText('old prompt')).toBeInTheDocument();
  });

  it('calls onSelectPrompt when a prompt is clicked', () => {
    const onSelect = vi.fn();
    useGenerationStore.setState({
      promptHistory: [makeEntry({ id: 'e1', prompt: 'lo-fi chill beat' })],
    });
    render(<PromptHistoryPanel onSelectPrompt={onSelect} />);
    fireEvent.click(screen.getByText('lo-fi chill beat'));
    expect(onSelect).toHaveBeenCalledWith('lo-fi chill beat');
  });

  it('shows metadata (BPM, key) when available', () => {
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'e1', prompt: 'jazz piano', bpm: 140, keyScale: 'Bb Minor' }),
      ],
    });
    render(<PromptHistoryPanel />);
    expect(screen.getByText(/140/)).toBeInTheDocument();
    expect(screen.getByText(/Bb Minor/)).toBeInTheDocument();
  });

  it('shows track name when available', () => {
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'e1', prompt: 'rock drums', trackName: 'Drums' }),
      ],
    });
    render(<PromptHistoryPanel />);
    expect(screen.getByText('Drums')).toBeInTheDocument();
  });

  it('filters prompts by search query', () => {
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'e1', prompt: 'ambient pad texture' }),
        makeEntry({ id: 'e2', prompt: 'aggressive metal riff' }),
        makeEntry({ id: 'e3', prompt: 'ambient drone' }),
      ],
    });
    render(<PromptHistoryPanel />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'ambient' } });
    const items = screen.getAllByTestId(/^prompt-history-item-/);
    expect(items).toHaveLength(2);
  });

  it('clears all history when clear button is clicked', () => {
    const clearPromptHistory = vi.fn();
    useGenerationStore.setState({
      promptHistory: [makeEntry()],
      clearPromptHistory,
    });
    render(<PromptHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearPromptHistory).toHaveBeenCalled();
  });

  it('shows relative timestamp', () => {
    const now = Date.now();
    useGenerationStore.setState({
      promptHistory: [
        makeEntry({ id: 'e1', prompt: 'test', timestamp: now - 120000 }), // 2 min ago
      ],
    });
    render(<PromptHistoryPanel />);
    expect(screen.getByText(/2m ago/i)).toBeInTheDocument();
  });
});
