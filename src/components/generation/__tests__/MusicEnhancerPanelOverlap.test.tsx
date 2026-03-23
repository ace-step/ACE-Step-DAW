import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MusicEnhancerPanel } from '../MusicEnhancerPanel';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/generationPipeline', () => ({
  generateCoverClip: vi.fn(),
}));

vi.mock('../../../services/aceStepApi', () => ({
  modelSupportsTaskType: () => true,
}));

describe('MusicEnhancerPanel bottom panel overlap', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('uses default bottom when no bottom panel is active', () => {
    useUIStore.setState({ musicEnhancerOpen: true, activeBottomPanel: null });
    render(<MusicEnhancerPanel />);

    const panel = screen.getByTestId('music-enhancer-panel');
    expect(panel.style.bottom).toBe('60px');
  });

  it('increases bottom position when drum machine is open', () => {
    useUIStore.setState({
      musicEnhancerOpen: true,
      activeBottomPanel: 'drumMachine',
      drumMachineEditorHeight: 400,
    });
    render(<MusicEnhancerPanel />);

    const panel = screen.getByTestId('music-enhancer-panel');
    expect(panel.style.bottom).toBe('460px'); // 60 + 400
  });

  it('increases bottom position when piano roll is open', () => {
    useUIStore.setState({
      musicEnhancerOpen: true,
      activeBottomPanel: 'pianoRoll',
      pianoRollHeight: 360,
    });
    render(<MusicEnhancerPanel />);

    const panel = screen.getByTestId('music-enhancer-panel');
    expect(panel.style.bottom).toBe('420px'); // 60 + 360
  });

  it('has smooth transition class for bottom repositioning', () => {
    useUIStore.setState({ musicEnhancerOpen: true });
    render(<MusicEnhancerPanel />);

    const panel = screen.getByTestId('music-enhancer-panel');
    expect(panel.className).toContain('transition-[bottom]');
  });
});
