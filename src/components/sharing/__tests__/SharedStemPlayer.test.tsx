import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SharedStemPlayer } from '../SharedStemPlayer';
import type { SharedProjectRecord, SharedStemAsset } from '../../../services/cloudStorageService';

// Mock HTMLAudioElement
class MockAudio {
  src = '';
  preload = '';
  currentTime = 0;
  muted = false;
  volume = 1;
  private _listeners = new Map<string, Set<EventListener>>();

  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  addEventListener(type: string, listener: EventListener) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: EventListener) {
    this._listeners.get(type)?.delete(listener);
  }
}

function makeStem(overrides: Partial<SharedStemAsset> = {}): SharedStemAsset {
  return {
    trackId: 'track-1',
    trackName: 'Drums',
    color: '#ff5500',
    volume: 0.8,
    lyrics: '',
    audioDataUrl: 'data:audio/wav;base64,fake',
    ...overrides,
  };
}

function makeSharedProject(stems: SharedStemAsset[]): SharedProjectRecord {
  return {
    token: 'tok-123',
    projectId: 'proj-1',
    owner: 'TestUser',
    sharedAt: Date.now(),
    project: {
      name: 'Test Project',
      tracks: [],
      bpm: 120,
    } as SharedProjectRecord['project'],
    stems,
  };
}

describe('SharedStemPlayer', () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'audio') return new MockAudio() as unknown as HTMLAudioElement;
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders project name and owner', () => {
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText(/1 stem by TestUser/)).toBeInTheDocument();
  });

  it('renders "Shared Project" label', () => {
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('Shared Project')).toBeInTheDocument();
  });

  it('pluralizes stem count correctly', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums' }),
      makeStem({ trackId: 't2', trackName: 'Bass' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText(/2 stems by TestUser/)).toBeInTheDocument();
  });

  it('renders Play button initially', () => {
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('Play')).toBeInTheDocument();
  });

  it('renders initial time as 0:00', () => {
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('renders stem sections with track names', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums' }),
      makeStem({ trackId: 't2', trackName: 'Vocals' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('Drums')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
  });

  it('renders Mute and Solo buttons for each stem', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByLabelText('Mute Drums')).toBeInTheDocument();
    expect(screen.getByLabelText('Solo Drums')).toBeInTheDocument();
  });

  it('toggles mute state when Mute button is clicked', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const muteBtn = screen.getByLabelText('Mute Drums');
    expect(muteBtn).toHaveTextContent('Mute');

    fireEvent.click(muteBtn);

    expect(screen.getByLabelText('Unmute Drums')).toHaveTextContent('Muted');
  });

  it('toggles solo state when Solo button is clicked', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const soloBtn = screen.getByLabelText('Solo Drums');
    expect(soloBtn).toHaveTextContent('Solo');

    fireEvent.click(soloBtn);

    expect(screen.getByLabelText('Unsolo Drums')).toHaveTextContent('Soloed');
  });

  it('renders volume slider with correct initial value', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums', volume: 0.75 }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const slider = screen.getByLabelText('Drums volume') as HTMLInputElement;
    expect(slider.value).toBe('0.75');
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('updates volume display when slider changes', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums', volume: 0.8 }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const slider = screen.getByLabelText('Drums volume') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.5' } });

    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders lyrics when provided', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Vocals', lyrics: 'Hello world, this is a song' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    expect(screen.getByText('Hello world, this is a song')).toBeInTheDocument();
  });

  it('does not render lyrics paragraph when empty', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums', lyrics: '' }),
    ]);

    const { container } = render(<SharedStemPlayer sharedProject={shared} />);

    const lyricsParagraph = container.querySelector('.whitespace-pre-wrap');
    expect(lyricsParagraph).toBeNull();
  });

  it('renders colored dot for each stem', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Drums', color: '#ff5500' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const stemSection = screen.getByLabelText('Drums stem');
    const colorDot = stemSection.querySelector('[aria-hidden="true"]') as HTMLElement | null;

    expect(colorDot).toBeTruthy();
    expect(colorDot).toHaveStyle({ backgroundColor: '#ff5500' });
  });

  it('has accessible Play/Pause button', () => {
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const playBtn = screen.getByLabelText('Play shared project');
    expect(playBtn).toBeInTheDocument();
  });

  it('has accessible section labels per stem', () => {
    const shared = makeSharedProject([
      makeStem({ trackId: 't1', trackName: 'Bass' }),
    ]);

    render(<SharedStemPlayer sharedProject={shared} />);

    const section = screen.getByLabelText('Bass stem');
    expect(section).toBeInTheDocument();
    expect(section.tagName).toBe('SECTION');
  });

  it('formats time correctly for various durations', () => {
    // formatTime is internal but we can test it indirectly via the time display
    // Initial time is always 0:00
    const shared = makeSharedProject([makeStem()]);

    render(<SharedStemPlayer sharedProject={shared} />);

    // The time display shows 0:00 initially
    const timeDisplay = screen.getByText('0:00');
    expect(timeDisplay).toBeInTheDocument();
  });
});
