import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { useUIStore } from '../../../store/uiStore';

describe('KeyboardShortcutsDialog', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({ showKeyboardShortcutsDialog: true });
  });

  it('renders nothing when not shown', () => {
    useUIStore.setState({ showKeyboardShortcutsDialog: false });
    const { container } = render(<KeyboardShortcutsDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog title', () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('renders as a modal dialog', () => {
    render(<KeyboardShortcutsDialog />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders shortcut categories', () => {
    render(<KeyboardShortcutsDialog />);
    // Should have category headings
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('renders Customize button', () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.getByText('Customize…')).toBeInTheDocument();
  });

  it('closes on close button click', () => {
    render(<KeyboardShortcutsDialog />);
    fireEvent.click(screen.getByLabelText('Close keyboard shortcuts'));
    expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(false);
  });

  it('closes on Escape key', () => {
    const { container } = render(<KeyboardShortcutsDialog />);
    const overlay = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(false);
  });

  it('opens shortcut editor on Customize click', () => {
    render(<KeyboardShortcutsDialog />);
    fireEvent.click(screen.getByText('Customize…'));
    expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(false);
    expect(useUIStore.getState().showShortcutEditorDialog).toBe(true);
  });

  it('shows hint about Escape key', () => {
    render(<KeyboardShortcutsDialog />);
    expect(screen.getByText(/Press/)).toBeInTheDocument();
  });

  it('renders keyboard shortcut keys as kbd elements', () => {
    const { container } = render(<KeyboardShortcutsDialog />);
    const kbdElements = container.querySelectorAll('kbd');
    expect(kbdElements.length).toBeGreaterThan(0);
  });
});
