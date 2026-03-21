import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  headless: true,
  timeout: 30000,
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log('Navigating...');
await page.goto('http://127.0.0.1:5174/', { timeout: 60000 });

// Wait for store to be available
await page.waitForFunction(
  () => (window).__store !== undefined && (window).__uiStore !== undefined,
  null,
  { timeout: 15000 },
);
console.log('Store ready');

// Setup project with clips (following E2E test patterns)
await page.evaluate(() => {
  const store = window.__store;
  const uiStore = window.__uiStore;

  store.getState().createProject({ name: 'PR 686 Verification', bpm: 120 });
  uiStore.getState().setShowNewProjectDialog(false);

  // Track 1: vocals with a clip
  const track1 = store.getState().addTrack('vocals');
  const clip1 = store.getState().addClip(track1.id, {
    startTime: 0,
    duration: 4,
    prompt: 'Dreamy synth pad',
    lyrics: '',
    source: 'uploaded',
  });
  // Make clip "ready" so it renders with waveform
  store.getState().updateClipStatus(clip1.id, 'ready', {
    isolatedAudioKey: 'stub-audio-1',
    waveformPeaks: [0.3, 0.5, 0.7, 0.4, 0.9, 0.6, 0.8, 0.3, 0.5, 0.7, 0.2, 0.6, 0.8, 0.4, 0.3, 0.5],
  });

  // Track 2: different color, another clip
  const track2 = store.getState().addTrack('vocals');
  const clip2 = store.getState().addClip(track2.id, {
    startTime: 2,
    duration: 6,
    prompt: 'Upbeat drum pattern',
    lyrics: '',
    source: 'uploaded',
  });
  store.getState().updateClipStatus(clip2.id, 'ready', {
    isolatedAudioKey: 'stub-audio-2',
    waveformPeaks: [0.8, 0.3, 0.9, 0.2, 0.7, 0.5, 0.4, 0.8, 0.6, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6, 0.8],
  });

  // Track 3: third track
  const track3 = store.getState().addTrack('vocals');
  const clip3 = store.getState().addClip(track3.id, {
    startTime: 1,
    duration: 5,
    prompt: 'Bass line groove',
    lyrics: '',
    source: 'uploaded',
  });
  store.getState().updateClipStatus(clip3.id, 'ready', {
    isolatedAudioKey: 'stub-audio-3',
    waveformPeaks: [0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.9, 0.4, 0.6, 0.8, 0.3, 0.5, 0.7, 0.2, 0.8, 0.6],
  });

  uiStore.getState().setPixelsPerSecond(80);
});

await page.waitForTimeout(1500);

// Verify DOM has clip blocks
const clipCount = await page.evaluate(() => document.querySelectorAll('[data-clip-block]').length);
console.log(`Clip blocks in DOM: ${clipCount}`);

// Screenshot 1: All clips unselected
await page.screenshot({ path: 'screenshots/01-all-clips-unselected.png' });
console.log('Screenshot 1: all clips unselected');

// Select the first clip to show selected state (ivory body)
await page.evaluate(() => {
  const store = window.__store;
  const uiStore = window.__uiStore;
  const tracks = store.getState().project.tracks;
  const firstClip = tracks[0]?.clips[0];
  if (firstClip) {
    uiStore.getState().selectClip(firstClip.id);
  }
});
await page.waitForTimeout(500);

// Screenshot 2: First clip selected
await page.screenshot({ path: 'screenshots/02-first-clip-selected.png' });
console.log('Screenshot 2: first clip selected');

// Get closeup of each clip
const clipBlocks = await page.$$('[data-clip-block]');
for (let i = 0; i < clipBlocks.length; i++) {
  const box = await clipBlocks[i].boundingBox();
  if (box && box.width > 0) {
    await clipBlocks[i].screenshot({ path: `screenshots/03-clip-${i}-closeup.png` });
    console.log(`Clip ${i} closeup (${Math.round(box.width)}x${Math.round(box.height)}px)`);
  }
}

// Verify header rails
const railInfo = await page.evaluate(() => {
  const rails = document.querySelectorAll('[data-clip-header-rail="true"]');
  const bodies = document.querySelectorAll('[data-testid="clip-body-surface"]');
  const results = [];
  rails.forEach((rail, i) => {
    const rect = rail.getBoundingClientRect();
    const style = window.getComputedStyle(rail);
    results.push({
      index: i,
      height: rect.height,
      background: rail.style.background,
      ariaLabel: rail.getAttribute('aria-label'),
    });
  });
  const bodyResults = [];
  bodies.forEach((body, i) => {
    bodyResults.push({
      index: i,
      background: body.style.background,
    });
  });
  return { rails: results, bodies: bodyResults };
});
console.log('Header rails:', JSON.stringify(railInfo.rails, null, 2));
console.log('Body surfaces:', JSON.stringify(railInfo.bodies, null, 2));

// Select multiple clips to show contrast
await page.evaluate(() => {
  const store = window.__store;
  const uiStore = window.__uiStore;
  const tracks = store.getState().project.tracks;
  // Select first and third clips
  const clipIds = [tracks[0]?.clips[0]?.id, tracks[2]?.clips[0]?.id].filter(Boolean);
  uiStore.getState().selectClips(clipIds);
});
await page.waitForTimeout(500);

// Screenshot 3: Multiple selected + unselected for contrast
await page.screenshot({ path: 'screenshots/04-mixed-selection.png' });
console.log('Screenshot 4: mixed selection (selected vs unselected)');

// Closeup of selected clip
const selectedClips = await page.$$('[data-clip-block]');
for (let i = 0; i < selectedClips.length; i++) {
  const box = await selectedClips[i].boundingBox();
  if (box && box.width > 0) {
    await selectedClips[i].screenshot({ path: `screenshots/05-mixed-clip-${i}.png` });
  }
}

await browser.close();
console.log('Done! All screenshots saved.');
