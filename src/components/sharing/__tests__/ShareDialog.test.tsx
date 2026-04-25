import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareDialog } from '../ShareDialog';
import { useCollaborationStore } from '../../../store/collaborationStore';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectSharingService', () => ({
  createProjectShare: vi.fn().mockResolvedValue({
    shareUrl: 'https://example.com/share/abc123',
    record: { token: 'tok-123' },
  }),
}));

vi.mock('../../../services/collaborationService', () => ({
  exportShareBundle: vi.fn().mockReturnValue('{"format":"ace-step-share"}'),
  importShareBundle: vi.fn().mockReturnValue({
    project: { name: 'Imported Project', tracks: [], bpm: 120 },
  }),
  downloadShareBundle: vi.fn(),
  copyShareLinkToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupStores(opts: { show?: boolean; shareUrl?: string | null; busy?: boolean } = {}) {
  useCollaborationStore.setState({
    showShareDialog: opts.show ?? true,
    activeShareUrl: opts.shareUrl ?? null,
    cloudBusy: opts.busy ?? false,
  });

  useProjectStore.getState().createProject();
}

describe('ShareDialog', () => {
  beforeEach(() => {
    useCollaborationStore.getState().reset();
    useProjectStore.setState({ project: null });
  });

  it('renders nothing when showShareDialog is false', () => {
    setupStores({ show: false });

    const { container } = render(<ShareDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when shown', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    expect(screen.getByText('Share Project')).toBeInTheDocument();
  });

  it('renders Share and Import tabs', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('shows the share tab content by default', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    expect(screen.getByText('Create a browser-ready review link')).toBeInTheDocument();
    expect(screen.getByText('Render Stems & Create Link')).toBeInTheDocument();
  });

  it('shows track count in share tab', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    // Default project has 0 tracks — "0 tracks in project"
    expect(screen.getByText(/\d+ tracks? in project/)).toBeInTheDocument();
  });

  it('disables render button when cloudBusy', () => {
    setupStores({ show: true, busy: true });

    render(<ShareDialog />);

    const renderBtn = screen.getByText('Rendering Stems...');
    expect(renderBtn).toBeDisabled();
  });

  it('shows share URL input when activeShareUrl is set', () => {
    setupStores({ show: true, shareUrl: 'https://example.com/share/abc' });

    render(<ShareDialog />);

    const urlInput = screen.getByDisplayValue('https://example.com/share/abc');
    expect(urlInput).toBeInTheDocument();
    expect(urlInput).toHaveAttribute('readOnly');
  });

  it('shows Copy button alongside share URL', () => {
    setupStores({ show: true, shareUrl: 'https://example.com/share/abc' });

    render(<ShareDialog />);

    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('calls createProjectShare on render button click', async () => {
    const { createProjectShare } = await import('../../../services/projectSharingService');
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Render Stems & Create Link'));

    await waitFor(() => {
      expect(createProjectShare).toHaveBeenCalled();
    });
  });

  it('copies share link when Copy button is clicked', async () => {
    const { copyShareLinkToClipboard } = await import('../../../services/collaborationService');
    setupStores({ show: true, shareUrl: 'https://example.com/share/abc' });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => {
      expect(copyShareLinkToClipboard).toHaveBeenCalledWith('https://example.com/share/abc');
    });
  });

  it('shows Download and Copy JSON buttons', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    expect(screen.getByText('Download .json')).toBeInTheDocument();
    expect(screen.getByText('Copy JSON')).toBeInTheDocument();
  });

  it('downloads bundle on Download button click', async () => {
    const { downloadShareBundle } = await import('../../../services/collaborationService');
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Download .json'));

    expect(downloadShareBundle).toHaveBeenCalled();
  });

  it('closes dialog when X button is clicked', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByLabelText('Close share dialog'));

    expect(useCollaborationStore.getState().showShareDialog).toBe(false);
  });

  it('closes dialog when Close button is clicked', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    // The Close button at the bottom footer
    fireEvent.click(screen.getByText('Close'));

    expect(useCollaborationStore.getState().showShareDialog).toBe(false);
  });

  it('switches to Import tab and shows import UI', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Import'));

    expect(screen.getByText('Import from File')).toBeInTheDocument();
    expect(screen.getByText('Or paste bundle JSON:')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('{"format":"ace-step-share",...}')).toBeInTheDocument();
  });

  it('disables Import from Text when textarea is empty', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Import'));

    const importBtn = screen.getByText('Import from Text');
    expect(importBtn).toBeDisabled();
  });

  it('enables Import from Text when textarea has content', () => {
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Import'));

    const textarea = screen.getByPlaceholderText('{"format":"ace-step-share",...}');
    fireEvent.change(textarea, { target: { value: '{"format":"ace-step-share"}' } });

    const importBtn = screen.getByText('Import from Text');
    expect(importBtn).not.toBeDisabled();
  });

  it('imports project from pasted text', async () => {
    const { importShareBundle } = await import('../../../services/collaborationService');
    setupStores({ show: true });

    render(<ShareDialog />);

    fireEvent.click(screen.getByText('Import'));

    const textarea = screen.getByPlaceholderText('{"format":"ace-step-share",...}');
    fireEvent.change(textarea, { target: { value: '{"format":"ace-step-share"}' } });

    fireEvent.click(screen.getByText('Import from Text'));

    expect(importShareBundle).toHaveBeenCalledWith('{"format":"ace-step-share"}');
  });

  it('shows progress label during stem rendering', () => {
    setupStores({ show: true, busy: true });

    render(<ShareDialog />);

    expect(screen.getByText('Rendering stems...')).toBeInTheDocument();
  });
});
