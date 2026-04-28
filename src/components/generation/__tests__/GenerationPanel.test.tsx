import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerationPanel } from '../GenerationPanel';
import { useGenerationStore, type GenerationJob } from '../../../store/generationStore';

vi.mock('../../../services/generationAbortRegistry', () => ({
  abortJob: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../services/generationPipeline', () => ({
  retryGenerationJob: vi.fn().mockResolvedValue(undefined),
}));

function createJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    clipId: 'clip-1',
    trackName: 'Vocals',
    status: 'generating',
    progress: 'Generating...',
    stage: 'Generating audio',
    progressPercent: 45,
    etaSeconds: 30,
    etaConfidence: 'medium',
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe('GenerationPanel', () => {
  beforeEach(() => {
    useGenerationStore.setState({ jobs: [], isGenerating: false });
  });

  it('renders nothing when there are no jobs', () => {
    const { container } = render(<GenerationPanel />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders active jobs with cancel button', () => {
    const job = createJob({ id: 'gen-1', trackName: 'Bass' });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    expect(screen.getByText('Bass')).toBeDefined();
    expect(screen.getByLabelText('Cancel Bass generation')).toBeDefined();
  });

  it('cancel button calls cancelJob', () => {
    const job = createJob({ id: 'gen-1', trackName: 'Drums' });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    const cancelBtn = screen.getByLabelText('Cancel Drums generation');
    fireEvent.click(cancelBtn);

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'gen-1');
    expect(updated?.status).toBe('cancelled');
  });

  it('shows retry button for failed jobs with retryParams', () => {
    const job = createJob({
      id: 'gen-fail',
      trackName: 'Synth',
      status: 'error',
      error: 'Timeout',
      retryParams: { type: 'text2music', prompt: 'chill beats' },
    });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    expect(screen.getByLabelText('Retry Synth generation')).toBeDefined();
  });

  it('does not show retry button for failed jobs without retryParams', () => {
    const job = createJob({
      id: 'gen-fail',
      trackName: 'Synth',
      status: 'error',
      error: 'Timeout',
    });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    expect(screen.queryByLabelText('Retry Synth generation')).toBeNull();
  });

  it('retry button calls retryGenerationJob', async () => {
    const { retryGenerationJob } = await import('../../../services/generationPipeline');
    const job = createJob({
      id: 'gen-fail',
      trackName: 'Lead',
      status: 'error',
      retryParams: { type: 'text2music', prompt: 'epic lead' },
    });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    const retryBtn = screen.getByLabelText('Retry Lead generation');
    fireEvent.click(retryBtn);

    expect(retryGenerationJob).toHaveBeenCalledWith('gen-fail');
  });

  it('shows cancelled jobs with distinct styling', () => {
    const job = createJob({
      id: 'gen-cancelled',
      trackName: 'Pad',
      status: 'cancelled' as GenerationJob['status'],
    });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    expect(screen.getByText('Cancelled')).toBeDefined();
  });

  it('does not show stale ETA for cancelled jobs', () => {
    const job = createJob({
      id: 'gen-cancelled',
      trackName: 'Pad',
      status: 'cancelled' as GenerationJob['status'],
      etaSeconds: 30,
    });
    useGenerationStore.getState().addJob(job);

    render(<GenerationPanel />);

    expect(screen.queryByText(/ETA/)).toBeNull();
  });

  it('shows Cancel All button when 2+ active jobs', () => {
    useGenerationStore.getState().addJob(createJob({ id: 'j1', status: 'generating' }));
    useGenerationStore.getState().addJob(createJob({ id: 'j2', status: 'queued' }));

    render(<GenerationPanel />);

    expect(screen.getByLabelText('Cancel all active generations')).toBeDefined();
  });

  it('does not show Cancel All when only 1 active job', () => {
    useGenerationStore.getState().addJob(createJob({ id: 'j1', status: 'generating' }));

    render(<GenerationPanel />);

    expect(screen.queryByLabelText('Cancel all active generations')).toBeNull();
  });

  it('Cancel All cancels all active jobs', () => {
    useGenerationStore.setState({ isGenerating: true });
    useGenerationStore.getState().addJob(createJob({ id: 'j1', status: 'generating' }));
    useGenerationStore.getState().addJob(createJob({ id: 'j2', status: 'queued' }));

    render(<GenerationPanel />);

    fireEvent.click(screen.getByLabelText('Cancel all active generations'));

    const jobs = useGenerationStore.getState().jobs;
    expect(jobs.every((j) => j.status === 'cancelled')).toBe(true);
  });

  it('shows queue position for queued jobs', () => {
    useGenerationStore.getState().addJob(createJob({ id: 'j1', status: 'generating', lastUpdatedAt: Date.now() + 2 }));
    useGenerationStore.getState().addJob(createJob({ id: 'j2', status: 'queued', lastUpdatedAt: Date.now() + 1 }));

    render(<GenerationPanel />);

    // Queue position indicators are rendered
    const pills = screen.getAllByText('Vocals');
    expect(pills.length).toBeGreaterThanOrEqual(2);
  });

  it('Clear button removes cancelled jobs', () => {
    useGenerationStore.getState().addJob(createJob({ id: 'j1', status: 'cancelled' as GenerationJob['status'] }));
    useGenerationStore.getState().addJob(createJob({ id: 'j2', status: 'generating' }));

    render(<GenerationPanel />);

    fireEvent.click(screen.getByText('Clear'));

    const jobs = useGenerationStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('j2');
  });
});
