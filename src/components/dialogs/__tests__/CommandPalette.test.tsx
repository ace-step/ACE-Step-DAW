import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '../../../store/uiStore';

describe('CommandPalette', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.setState({
      showCommandPalette: true,
      commandPaletteQuery: '',
    });
  });

  it('renders nothing when not shown', () => {
    useUIStore.setState({ showCommandPalette: false });
    const { container } = render(<CommandPalette />);
    expect(container.innerHTML).toBe('');
  });

  it('renders Command Palette title', () => {
    render(<CommandPalette />);
    expect(screen.getByText('Command Palette')).toBeInTheDocument();
  });

  it('renders as a modal dialog', () => {
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders search input', () => {
    render(<CommandPalette />);
    const input = screen.getByLabelText('Command palette search');
    expect(input).toBeInTheDocument();
  });

  it('shows placeholder text', () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText(/Try .add reverb/);
    expect(input).toBeInTheDocument();
  });

  it('renders command results listbox', () => {
    render(<CommandPalette />);
    // With empty query, command palette shows all commands as results
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
  });

  it('updates query on input change', () => {
    render(<CommandPalette />);
    const input = screen.getByLabelText('Command palette search');
    fireEvent.change(input, { target: { value: 'add track' } });
    expect(useUIStore.getState().commandPaletteQuery).toBe('add track');
  });

  it('closes on Escape key in input', () => {
    render(<CommandPalette />);
    const input = screen.getByLabelText('Command palette search');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useUIStore.getState().showCommandPalette).toBe(false);
  });

  it('shows Esc shortcut hint', () => {
    render(<CommandPalette />);
    const kbds = screen.getAllByText('Esc');
    expect(kbds.length).toBeGreaterThanOrEqual(1);
  });

  it('shows no-results message for non-matching query', () => {
    useUIStore.setState({ commandPaletteQuery: 'zzzznonexistent12345' });
    render(<CommandPalette />);
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('shows description text', () => {
    render(<CommandPalette />);
    expect(screen.getByText(/Search actions, track intents/)).toBeInTheDocument();
  });
});
