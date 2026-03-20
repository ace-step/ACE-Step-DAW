import type { Page } from '@playwright/test';
import type {
  AgentProjectState,
  DAWGlobals,
  TransportState,
  UIState,
} from '../../src/types/dawActions';

export type E2EBrowserWindow = Window & Pick<
  DAWGlobals,
  '__store' | '__uiStore' | '__transportStore' | '__shortcutsStore' | '__keyboardCommands'
>;

export async function waitForBrowserStores(page: Page, timeout = 15_000) {
  await page.waitForFunction(
    () => {
      const dawWindow = window as E2EBrowserWindow;
      return typeof dawWindow.__store !== 'undefined' && typeof dawWindow.__uiStore !== 'undefined';
    },
    null,
    { timeout },
  );
}

export async function getProjectState(page: Page): Promise<AgentProjectState> {
  return page.evaluate(() => {
    const dawWindow = window as E2EBrowserWindow;
    return dawWindow.__store.getState();
  });
}

export async function getUIState(page: Page): Promise<UIState> {
  return page.evaluate(() => {
    const dawWindow = window as E2EBrowserWindow;
    return dawWindow.__uiStore.getState();
  });
}

export async function getTransportState(page: Page): Promise<TransportState> {
  return page.evaluate(() => {
    const dawWindow = window as E2EBrowserWindow;
    return dawWindow.__transportStore.getState();
  });
}

export async function getTrackCount(page: Page): Promise<number> {
  const state = await getProjectState(page);
  return state.project?.tracks?.length ?? 0;
}

export async function getProjectName(page: Page): Promise<string | null> {
  const state = await getProjectState(page);
  return state.project?.name ?? null;
}

export async function getProjectBpm(page: Page): Promise<number | null> {
  const state = await getProjectState(page);
  return state.project?.bpm ?? null;
}
