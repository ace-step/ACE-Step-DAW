import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrackHeightPresetSelector } from '../../src/components/tracks/TrackHeightPresetSelector';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('TrackHeightPresetSelector', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('renders a button with data-testid', () => {
    render(<TrackHeightPresetSelector />);
    expect(screen.getByTestId('track-height-preset-btn')).toBeInTheDocument();
  });

  it('opens a dropdown with preset options on click', () => {
    render(<TrackHeightPresetSelector />);
    fireEvent.click(screen.getByTestId('track-height-preset-btn'));
    expect(screen.getByText('Small')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('calls setAllTracksHeightPreset when a preset is clicked', () => {
    useProjectStore.getState().addTrack('stems');
    useProjectStore.getState().addTrack('stems', 'sequencer');

    render(<TrackHeightPresetSelector />);
    fireEvent.click(screen.getByTestId('track-height-preset-btn'));
    fireEvent.click(screen.getByText('Small'));

    const tracks = useProjectStore.getState().project!.tracks;
    for (const t of tracks) {
      expect(t.laneHeight).toBe(48);
    }
  });

  it('closes the dropdown after selecting a preset', () => {
    render(<TrackHeightPresetSelector />);
    fireEvent.click(screen.getByTestId('track-height-preset-btn'));
    expect(screen.getByText('Small')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Small'));
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside', () => {
    render(
      <div>
        <TrackHeightPresetSelector />
        <span data-testid="outside">outside</span>
      </div>,
    );
    fireEvent.click(screen.getByTestId('track-height-preset-btn'));
    expect(screen.getByText('Small')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Small')).not.toBeInTheDocument();
  });
});
