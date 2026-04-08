import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationPanel } from '../GenerationPanel';
import { useGenerationStore } from '../../../store/generationStore';
import type { GenerationJob } from '../../../store/generationStore';

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: 'job-1',
    clipId: 'clip-1',
    trackName: 'Track 1',
    status: 'generating',
    progress: 'generating',
    stage: 'inference',
    progressPercent: 50,
    etaSeconds: 15,
    etaConfidence: 'medium',
    ...overrides,
  } as GenerationJob;
}

describe('GenerationPanel ETA confidence', () => {
  beforeEach(() => {
    useGenerationStore.setState({ jobs: [] });
  });

  it('shows confidence indicator for high confidence ETA', () => {
    useGenerationStore.setState({ jobs: [makeJob({ etaConfidence: 'high' })] });
    render(<GenerationPanel />);
    expect(screen.getByText(/ETA/)).toBeInTheDocument();
    // High confidence should not show a warning indicator
    expect(screen.queryByTitle(/estimate may be inaccurate/i)).not.toBeInTheDocument();
  });

  it('shows low confidence indicator when ETA is uncertain', () => {
    useGenerationStore.setState({ jobs: [makeJob({ etaConfidence: 'low', etaSeconds: 30 })] });
    render(<GenerationPanel />);
    const etaEl = screen.getByTitle(/estimate may be inaccurate/i);
    expect(etaEl).toBeInTheDocument();
  });

  it('does not show confidence indicator when no ETA is available', () => {
    useGenerationStore.setState({ jobs: [makeJob({ etaSeconds: null, etaConfidence: 'none' })] });
    render(<GenerationPanel />);
    expect(screen.queryByTitle(/estimate may be inaccurate/i)).not.toBeInTheDocument();
  });

  it('shows medium confidence without warning', () => {
    useGenerationStore.setState({ jobs: [makeJob({ etaConfidence: 'medium', etaSeconds: 20 })] });
    render(<GenerationPanel />);
    expect(screen.getByText(/ETA/)).toBeInTheDocument();
    expect(screen.queryByTitle(/estimate may be inaccurate/i)).not.toBeInTheDocument();
  });
});
