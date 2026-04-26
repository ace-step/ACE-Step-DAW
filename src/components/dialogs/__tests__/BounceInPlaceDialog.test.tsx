import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BounceInPlaceDialog } from '../BounceInPlaceDialog';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/actionApi', () => ({
  projectActionApi: {
    bounceInPlace: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
}));

vi.mock('../../../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

function setupBounceDialog() {
  useProjectStore.getState().createProject();
  useProjectStore.getState().addTrack('stems');
  const tracks = useProjectStore.getState().project!.tracks;
  const trackId = tracks[tracks.length - 1].id;
  useUIStore.setState({ bounceInPlaceTrackId: trackId });
  return trackId;
}

describe('BounceInPlaceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    setupBounceDialog();
  });

  it('renders nothing when no track selected', () => {
    useUIStore.setState({ bounceInPlaceTrackId: null });
    const { container } = render(<BounceInPlaceDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog title', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByText('Bounce In Place')).toBeInTheDocument();
  });

  it('renders track name', () => {
    render(<BounceInPlaceDialog />);
    const trackId = useUIStore.getState().bounceInPlaceTrackId!;
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(screen.getByText(track.displayName)).toBeInTheDocument();
  });

  it('renders 4 option checkboxes', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByLabelText('Include effects')).toBeInTheDocument();
    expect(screen.getByLabelText('Include automation')).toBeInTheDocument();
    expect(screen.getByLabelText('Normalize')).toBeInTheDocument();
    expect(screen.getByLabelText('Replace original')).toBeInTheDocument();
  });

  it('toggles Include effects checkbox', () => {
    render(<BounceInPlaceDialog />);
    const checkbox = screen.getByLabelText('Include effects') as HTMLInputElement;
    const initial = checkbox.checked;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(!initial);
  });

  it('has Cancel and Bounce Track buttons', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Bounce Track')).toBeInTheDocument();
  });

  it('closes on Cancel click', () => {
    render(<BounceInPlaceDialog />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(useUIStore.getState().bounceInPlaceTrackId).toBeNull();
  });

  it('has close button with aria-label', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByLabelText('Close bounce dialog')).toBeInTheDocument();
  });

  it('shows keyboard shortcut hint', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByText(/Shortcut:/)).toBeInTheDocument();
  });

  it('renders option descriptions', () => {
    render(<BounceInPlaceDialog />);
    expect(screen.getByText(/Bake the track effect chain/)).toBeInTheDocument();
    expect(screen.getByText(/Bake track volume and pan/)).toBeInTheDocument();
  });

  it('calls bounceInPlace API on Bounce Track click', async () => {
    const { projectActionApi } = await import('../../../services/actionApi');
    const trackId = useUIStore.getState().bounceInPlaceTrackId;
    render(<BounceInPlaceDialog />);
    fireEvent.click(screen.getByText('Bounce Track'));

    await waitFor(() => {
      expect(projectActionApi.bounceInPlace).toHaveBeenCalledWith({
        trackId,
        options: expect.objectContaining({
          includeEffects: expect.any(Boolean),
          includeAutomation: expect.any(Boolean),
          normalize: expect.any(Boolean),
          replaceOriginal: expect.any(Boolean),
        }),
      });
    });
    await waitFor(() => {
      expect(useUIStore.getState().bounceInPlaceTrackId).toBeNull();
    });
  });
});
