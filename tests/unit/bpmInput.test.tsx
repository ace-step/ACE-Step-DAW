import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NewProjectDialog } from '../../src/components/dialogs/NewProjectDialog';
import { SettingsDialog } from '../../src/components/dialogs/SettingsDialog';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import { getAudioEngine } from '../../src/hooks/useAudioEngine';

vi.mock('../../src/services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  initModel: vi.fn().mockResolvedValue({}),
  getBackendUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  setBackendUrl: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
  loadProject: vi.fn().mockResolvedValue(null),
  listTemplates: vi.fn().mockResolvedValue([]),
  loadTemplate: vi.fn().mockResolvedValue(null),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    previewMetronomeClick: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('BPM input — clamp on blur, not keystroke', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Latency Settings Test' });
  });

  function getBpmInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="number"]') as HTMLInputElement;
  }

  describe('NewProjectDialog', () => {
    beforeEach(() => {
      useUIStore.getState().setShowNewProjectDialog(true);
    });

    it('allows typing intermediate values below MIN_BPM without clamping', () => {
      const { container } = render(<NewProjectDialog />);
      const input = getBpmInput(container);

      // Clear and type "1" — should NOT be clamped to 30
      fireEvent.change(input, { target: { value: '1' } });
      expect(input.value).toBe('1');

      // Continue typing "12" — should NOT be clamped
      fireEvent.change(input, { target: { value: '12' } });
      expect(input.value).toBe('12');

      // Finish typing "120"
      fireEvent.change(input, { target: { value: '120' } });
      expect(input.value).toBe('120');
    });

    it('clamps to MIN_BPM on blur when value is too low', () => {
      const { container } = render(<NewProjectDialog />);
      const input = getBpmInput(container);

      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      expect(input.value).toBe('30');
    });

    it('clamps to MAX_BPM on blur when value is too high', () => {
      const { container } = render(<NewProjectDialog />);
      const input = getBpmInput(container);

      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.blur(input);
      expect(input.value).toBe('300');
    });

    it('defaults to 120 on blur when field is empty', () => {
      const { container } = render(<NewProjectDialog />);
      const input = getBpmInput(container);

      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);
      expect(input.value).toBe('120');
    });
  });

  describe('SettingsDialog', () => {
    beforeEach(() => {
      useUIStore.getState().setShowSettingsDialog(true);
      vi.mocked(getAudioEngine).mockReturnValue({
        previewMetronomeClick: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof getAudioEngine>);
    });

    function getSettingsBpmInput(container: HTMLElement): HTMLInputElement {
      // Settings dialog has multiple number inputs; BPM is the one with min=40
      const inputs = container.querySelectorAll('input[type="number"]');
      for (const inp of inputs) {
        if (inp.getAttribute('min') === '40') return inp as HTMLInputElement;
      }
      return inputs[0] as HTMLInputElement;
    }

    it('allows typing intermediate values without resetting', () => {
      const { container } = render(<SettingsDialog />);
      const input = getSettingsBpmInput(container);

      // Clear and type "1" — should NOT reset to 120
      fireEvent.change(input, { target: { value: '1' } });
      expect(input.value).toBe('1');

      fireEvent.change(input, { target: { value: '14' } });
      expect(input.value).toBe('14');

      fireEvent.change(input, { target: { value: '140' } });
      expect(input.value).toBe('140');
    });

    it('allows clearing the field without resetting to 120', () => {
      const { container } = render(<SettingsDialog />);
      const input = getSettingsBpmInput(container);

      fireEvent.change(input, { target: { value: '' } });
      expect(input.value).toBe('');
    });

    it('clamps on blur for out-of-range values', () => {
      const { container } = render(<SettingsDialog />);
      const input = getSettingsBpmInput(container);

      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      // Should clamp to min (30)
      expect(Number(input.value)).toBeGreaterThanOrEqual(30);
    });

    it('plays a metronome-style preview click on tap', () => {
      const previewMetronomeClick = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getAudioEngine).mockReturnValue({
        previewMetronomeClick,
      } as unknown as ReturnType<typeof getAudioEngine>);

      render(<SettingsDialog />);

      fireEvent.click(screen.getByRole('button', { name: 'Tap tempo' }));

      expect(previewMetronomeClick).toHaveBeenCalledTimes(1);
    });

    it('updates BPM from sequential tap tempo input', () => {
      const { container } = render(<SettingsDialog />);
      const input = getSettingsBpmInput(container);
      const tapButton = screen.getByRole('button', { name: 'Tap tempo' });
      let currentNow = 1000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentNow);

      act(() => {
        fireEvent.click(tapButton);
        currentNow = 1500;
        fireEvent.click(tapButton);
      });
      expect(input.value).toBe('120');

      act(() => {
        currentNow = 2000;
        fireEvent.click(tapButton);
      });
      expect(input.value).toBe('120');

      nowSpy.mockRestore();
    });

    it('shows the Key label and removes Key / Scale copy', () => {
      render(<SettingsDialog />);

      expect(screen.getByText('Key')).toBeInTheDocument();
      expect(screen.queryByText('Key / Scale')).not.toBeInTheDocument();
    });

    it('shows detected playback latency and saves a manual override', () => {
      const store = useProjectStore.getState();
      store.capturePlaybackLatency({ baseLatency: 0.005, outputLatency: 0.02 });

      render(<SettingsDialog />);

      expect(screen.getByText(/Detected 25\.0 ms from Web Audio/i)).toBeInTheDocument();

      const overrideInput = screen.getByLabelText(/Manual playback latency/i);
      fireEvent.change(overrideInput, { target: { value: '42' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
        source: 'manual',
        detectedLatencyMs: 25,
        manualOverrideMs: 42,
        compensationMs: 42,
      });
    });
  });
});
