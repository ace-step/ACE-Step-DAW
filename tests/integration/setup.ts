/**
 * Integration test setup — uses real Zustand stores with only browser APIs mocked.
 *
 * Mocking guidelines:
 * - MOCK: Browser APIs (AudioContext, MediaRecorder, IndexedDB, fetch)
 * - MOCK: Network calls (aceStepApi, WebSocket)
 * - REAL: Zustand stores (projectStore, transportStore, uiStore, generationStore)
 * - REAL: Pure utility functions (clipLayout, waveformPeaks, etc.)
 * - REAL: Business logic services (commandPalette, coreKeyboardActions, etc.)
 */

import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';

/**
 * Reset all stores to initial state.
 * Call this in beforeEach for clean test isolation.
 * Uses Zustand persist API to clear storage and prevent debounced writes
 * from polluting subsequent tests.
 */
export function resetAllStores() {
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  useTransportStore.setState(useTransportStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  // Clear persisted storage via Zustand persist API to avoid debounced write leaks
  if (useProjectStore.persist?.clearStorage) useProjectStore.persist.clearStorage();
  if (useGenerationStore.persist?.clearStorage) useGenerationStore.persist.clearStorage();
  localStorage.clear();
}

/**
 * Create a project with tracks for integration testing.
 */
export function createTestProject() {
  useProjectStore.getState().createProject({ name: 'Integration Test', bpm: 120 });
  const vocals = useProjectStore.getState().addTrack('vocals');
  const drums = useProjectStore.getState().addTrack('drums');
  const bass = useProjectStore.getState().addTrack('bass');
  return { vocals, drums, bass };
}
