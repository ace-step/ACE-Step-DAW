import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetronomeSettingsPopover } from '../MetronomeSettingsPopover';
import { useTransportStore } from '../../../store/transportStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('MetronomeSettingsPopover', () => {
  beforeEach(() => {
    useTransportStore.setState({
      metronomeSound: 'click',
      metronomeVolume: 0.5,
      countInBars: 1,
    });
  });

  it('renders when open', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    expect(screen.getByTestId('metronome-settings-popover')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(<MetronomeSettingsPopover open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('metronome-settings-popover')).toBeNull();
  });

  it('shows metronome sound selector with current value', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    const clickBtn = screen.getByTestId('sound-click');
    expect(clickBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('changes metronome sound when clicking a sound option', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('sound-woodblock'));
    expect(useTransportStore.getState().metronomeSound).toBe('woodblock');
  });

  it('shows volume slider', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    expect(screen.getByTestId('metronome-volume-slider')).toBeTruthy();
  });

  it('changes volume when sliding', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    const slider = screen.getByTestId('metronome-volume-slider');
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(useTransportStore.getState().metronomeVolume).toBe(0.8);
  });

  it('shows count-in bars selector with current value', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    const bar1 = screen.getByTestId('countin-1');
    expect(bar1.getAttribute('aria-pressed')).toBe('true');
  });

  it('changes count-in bars when clicking an option', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('countin-2'));
    expect(useTransportStore.getState().countInBars).toBe(2);
  });

  it('allows setting count-in to off (0 bars)', () => {
    render(<MetronomeSettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('countin-0'));
    expect(useTransportStore.getState().countInBars).toBe(0);
  });

  it('calls onClose when clicking backdrop', () => {
    const onClose = vi.fn();
    render(<MetronomeSettingsPopover open onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId('metronome-settings-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
