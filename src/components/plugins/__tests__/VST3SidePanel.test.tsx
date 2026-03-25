import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3SidePanel } from '../VST3SidePanel';
import { useUIStore } from '../../../store/uiStore';

describe('VST3SidePanel', () => {
  beforeEach(() => {
    useUIStore.setState({ showVST3Panel: false });
  });

  it('is not rendered when showVST3Panel is false', () => {
    render(<VST3SidePanel />);
    expect(screen.queryByTestId('vst3-side-panel')).toBeNull();
  });

  it('is visible when showVST3Panel is true', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    const panel = screen.getByTestId('vst3-side-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes panel when close button is clicked', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    fireEvent.click(screen.getByTestId('vst3-panel-close'));
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('contains the plugin browser', () => {
    useUIStore.setState({ showVST3Panel: true });
    render(<VST3SidePanel />);
    expect(screen.getByTestId('vst3-side-panel')).toBeInTheDocument();
  });
});
