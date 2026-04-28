import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharedProjectPage } from '../SharedProjectPage';
import type { SharedProjectRecord } from '../../../services/cloudStorageService';

// Mock SharedStemPlayer to avoid its audio dependencies
vi.mock('../SharedStemPlayer', () => ({
  SharedStemPlayer: ({ sharedProject }: { sharedProject: SharedProjectRecord }) => (
    <div data-testid="stem-player">{sharedProject.project.name}</div>
  ),
}));

function makeSharedProject(): SharedProjectRecord {
  return {
    token: 'tok-1',
    projectId: 'proj-1',
    owner: 'TestUser',
    sharedAt: Date.now(),
    project: {
      name: 'Demo Song',
      tracks: [],
      bpm: 120,
    } as SharedProjectRecord['project'],
    stems: [
      { trackId: 't1', trackName: 'Drums', color: '#ff0', volume: 0.8, lyrics: '', audioDataUrl: '' },
    ],
  };
}

describe('SharedProjectPage', () => {
  it('renders the page header text', () => {
    render(<SharedProjectPage sharedProject={makeSharedProject()} />);

    expect(screen.getByText('ACE-Step Web Share')).toBeInTheDocument();
    expect(screen.getByText(/Preview, mute, solo, and rebalance/)).toBeInTheDocument();
  });

  it('renders the SharedStemPlayer with the project', () => {
    render(<SharedProjectPage sharedProject={makeSharedProject()} />);

    expect(screen.getByTestId('stem-player')).toBeInTheDocument();
    expect(screen.getByText('Demo Song')).toBeInTheDocument();
  });

  it('contains usage instructions', () => {
    render(<SharedProjectPage sharedProject={makeSharedProject()} />);

    expect(screen.getByText(/space to play or pause/i)).toBeInTheDocument();
  });
});
