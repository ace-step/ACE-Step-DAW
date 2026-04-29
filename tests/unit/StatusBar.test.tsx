import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar, _resetLastKnownConnection } from '../../src/components/layout/StatusBar';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

const healthCheckMock = vi.fn();
const CURRENT_YEAR = new Date().getFullYear();

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: () => healthCheckMock(),
}));

describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    _resetLastKnownConnection();
  });

  it('delays the first health probe until the polling window', async () => {
    healthCheckMock.mockResolvedValue(true);

    render(<StatusBar />);

    // Connection indicator shows "Offline" initially (before first health check)
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(healthCheckMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(healthCheckMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(healthCheckMock).toHaveBeenCalledTimes(1);
  });

  describe('height', () => {
    it('uses h-6 (24px) instead of h-5 (20px)', () => {
      healthCheckMock.mockResolvedValue(false);
      render(<StatusBar />);
      const metaRow = screen.getByTestId('status-bar-meta-row');
      expect(metaRow.className).toContain('h-6');
      expect(metaRow.className).not.toContain('h-5');
    });
  });

  describe('connection status', () => {
    it('renders connection indicator with Offline/Online text', () => {
      healthCheckMock.mockResolvedValue(false);
      render(<StatusBar />);
      const indicator = screen.getByTestId('status-connection');
      expect(indicator).toBeInTheDocument();
      expect(indicator.textContent).toContain('Offline');
    });

    it('shows Online after successful health check', async () => {
      healthCheckMock.mockResolvedValue(true);
      render(<StatusBar />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_100);
      });

      const indicator = screen.getByTestId('status-connection');
      expect(indicator.textContent).toContain('Online');
    });

    it('shows "No model" when disconnected and no models configured', () => {
      healthCheckMock.mockResolvedValue(false);
      render(<StatusBar />);
      expect(screen.getByTestId('status-model-name')).toHaveTextContent('No model');
    });
  });

  describe('spacing', () => {
    it('uses gap-3 instead of gap-4', () => {
      healthCheckMock.mockResolvedValue(false);
      render(<StatusBar />);
      const metaRow = screen.getByTestId('status-bar-meta-row');
      expect(metaRow.className).toContain('gap-3');
      expect(metaRow.className).not.toContain('gap-4');
    });
  });

  describe('branding', () => {
    it('renders a copyright notice instead of the old marketing link', () => {
      healthCheckMock.mockResolvedValue(false);
      render(<StatusBar />);
      expect(screen.getByTestId('status-copyright-notice')).toHaveTextContent(`ACE Studio © ${CURRENT_YEAR}`);
      expect(screen.queryByRole('link', { name: /ACE Studio/ })).not.toBeInTheDocument();
    });
  });

  describe('job info', () => {
    it('does not render the duplicate primaryJob span', () => {
      healthCheckMock.mockResolvedValue(false);
      useGenerationStore.setState({
        jobs: [
          {
            id: 'job-1',
            clipId: 'clip-1',
            trackName: 'My Track',
            status: 'generating',
            progress: 'generating',
            stage: 'Rendering',
            progressPercent: 42,
            lastUpdatedAt: Date.now(),
          },
        ],
      });

      render(<StatusBar />);

      // The old duplicate span showed "My Track: Rendering 42%"
      // It should not exist anymore
      const duplicateSpans = screen.queryAllByText(/My Track: Rendering 42%/);
      expect(duplicateSpans).toHaveLength(0);
    });

    it('renders combined job info with track name, stage, percent, and job count', () => {
      healthCheckMock.mockResolvedValue(false);
      useGenerationStore.setState({
        jobs: [
          {
            id: 'job-1',
            clipId: 'clip-1',
            trackName: 'My Track',
            status: 'generating',
            progress: 'generating',
            stage: 'Rendering',
            progressPercent: 42,
            lastUpdatedAt: Date.now(),
          },
        ],
      });

      render(<StatusBar />);

      // Should show the new combined format
      expect(screen.getByText(/Generating:.*My Track/)).toBeInTheDocument();
      expect(screen.getByText(/Rendering/)).toBeInTheDocument();
      expect(screen.getByText(/42%/)).toBeInTheDocument();
      expect(screen.getByText(/1 job/)).toBeInTheDocument();
    });

    it('renders plural "jobs" when multiple active', () => {
      healthCheckMock.mockResolvedValue(false);
      useGenerationStore.setState({
        jobs: [
          {
            id: 'job-1',
            clipId: 'clip-1',
            trackName: 'Track A',
            status: 'generating',
            progress: 'generating',
            stage: 'Rendering',
            progressPercent: 50,
            lastUpdatedAt: Date.now(),
          },
          {
            id: 'job-2',
            clipId: 'clip-2',
            trackName: 'Track B',
            status: 'queued',
            progress: 'queued',
            stage: null,
            progressPercent: 0,
            lastUpdatedAt: Date.now() + 1,
          },
        ],
      });

      render(<StatusBar />);

      expect(screen.getByText(/2 jobs/)).toBeInTheDocument();
    });
  });
});
