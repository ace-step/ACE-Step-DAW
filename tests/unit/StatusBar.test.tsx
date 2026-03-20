import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar } from '../../src/components/layout/StatusBar';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

const healthCheckMock = vi.fn();

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: () => healthCheckMock(),
}));

describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  it('delays the first health probe until the polling window', async () => {
    healthCheckMock.mockResolvedValue(true);

    render(<StatusBar />);

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
});
