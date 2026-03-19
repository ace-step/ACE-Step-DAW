import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';

describe('onboarding store', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('applies simple workspace defaults', () => {
    useUIStore.getState().applyWorkspaceComplexity('simple');

    const state = useUIStore.getState();
    expect(state.workspaceComplexity).toBe('simple');
    expect(state.showSmartControls).toBe(true);
    expect(state.showMixer).toBe(false);
    expect(state.showLibrary).toBe(false);
    expect(state.trackListWidth).toBe(200);
  });

  it('applies advanced workspace defaults with higher panel density', () => {
    useUIStore.getState().applyWorkspaceComplexity('advanced');

    const state = useUIStore.getState();
    expect(state.workspaceComplexity).toBe('advanced');
    expect(state.showMixer).toBe(true);
    expect(state.showLibrary).toBe(true);
    expect(state.loopBrowserOpen).toBe(true);
    expect(state.showTempoLane).toBe(true);
    expect(state.pixelsPerSecond).toBe(100);
  });

  it('tracks tutorial completion after the fifth step', () => {
    useUIStore.getState().startTutorial();

    for (let i = 0; i < 5; i++) {
      useUIStore.getState().nextTutorialStep();
    }

    const state = useUIStore.getState();
    expect(state.activeTutorialStep).toBeNull();
    expect(state.tutorialCompleted).toBe(true);
    expect(state.tutorialSkipped).toBe(false);
  });

  it('persists dismissed onboarding tips without duplicates', () => {
    useUIStore.getState().dismissOnboardingTip('genr-first-pass');
    useUIStore.getState().dismissOnboardingTip('genr-first-pass');

    expect(useUIStore.getState().dismissedOnboardingTipIds).toEqual(['genr-first-pass']);
  });
});
