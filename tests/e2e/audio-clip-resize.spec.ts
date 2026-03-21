import { expect, test } from '@playwright/test';

test.describe('Audio clip resize semantics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => (window as any).__store !== undefined && (window as any).__uiStore !== undefined,
      null,
      { timeout: 10000 },
    );
  });

  test('keeps ordinary extension non-destructive and reserves Shift for repitch stretch', async ({ page }) => {
    const clipId = await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;

      store.getState().createProject({ name: 'Audio Resize E2E', bpm: 120 });
      uiStore.getState().setShowNewProjectDialog(false);
      uiStore.getState().setPixelsPerSecond(100);

      const track = store.getState().addTrack('vocals');
      const clip = store.getState().addClip(track.id, {
        startTime: 1,
        duration: 4,
        prompt: 'Resize test',
        lyrics: '',
        source: 'uploaded',
      });

      store.getState().updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'stub-audio',
        waveformPeaks: Array.from({ length: 1024 }, (_, index) => ((index % 17) + 1) / 17),
        audioDuration: 4,
        audioOffset: 0,
        source: 'uploaded',
      });

      return clip.id;
    });

    const clip = page.getByTestId(`clip-${clipId}`);
    await expect(clip).toBeVisible();

    let box = await clip.boundingBox();
    if (!box) throw new Error('Clip bounds missing before right extension');

    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 200, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    let state = await page.evaluate((id) => {
      const clipState = (window as any).__store.getState().getClipById(id);
      return {
        duration: clipState.duration,
        audioOffset: clipState.audioOffset ?? 0,
        contentOffset: clipState.contentOffset ?? 0,
      };
    }, clipId);

    expect(state.duration).toBeCloseTo(6, 2);
    expect(state.audioOffset).toBe(0);
    expect(state.contentOffset).toBe(0);

    let waveform = await page.evaluate((id) => {
      const clipEl = document.querySelector(`[data-testid="clip-${id}"]`) as HTMLElement;
      const rects = Array.from(clipEl.querySelectorAll('svg rect'));
      const firstX = Number(rects[0]?.getAttribute('x') ?? '0');
      const lastX = Number(rects[rects.length - 1]?.getAttribute('x') ?? '0');
      return {
        firstX,
        lastX,
        clipWidth: clipEl.getBoundingClientRect().width,
      };
    }, clipId);

    expect(waveform.firstX).toBe(0);
    expect(waveform.lastX).toBeLessThan(waveform.clipWidth - 100);

    box = await clip.boundingBox();
    if (!box) throw new Error('Clip bounds missing before left extension');

    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    state = await page.evaluate((id) => {
      const clipState = (window as any).__store.getState().getClipById(id);
      return {
        startTime: clipState.startTime,
        duration: clipState.duration,
        contentOffset: clipState.contentOffset ?? 0,
        stretchMode: clipState.stretchMode ?? null,
      };
    }, clipId);

    expect(state.startTime).toBe(0);
    expect(state.duration).toBeCloseTo(7, 2);
    expect(state.contentOffset).toBeCloseTo(1, 2);
    expect(state.stretchMode).toBeNull();

    waveform = await page.evaluate((id) => {
      const clipEl = document.querySelector(`[data-testid="clip-${id}"]`) as HTMLElement;
      const rects = Array.from(clipEl.querySelectorAll('svg rect'));
      return Number(rects[0]?.getAttribute('x') ?? '0');
    }, clipId);

    expect(waveform).toBeGreaterThanOrEqual(90);

    box = await clip.boundingBox();
    if (!box) throw new Error('Clip bounds missing before Shift stretch');

    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 100, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    const stretched = await page.evaluate((id) => {
      const clipState = (window as any).__store.getState().getClipById(id);
      const clipEl = document.querySelector(`[data-testid="clip-${id}"]`) as HTMLElement;
      const firstRect = clipEl.querySelector('svg rect');
      return {
        stretchMode: clipState.stretchMode,
        timeStretchRate: clipState.timeStretchRate,
        contentOffset: clipState.contentOffset ?? 0,
        firstRectX: Number(firstRect?.getAttribute('x') ?? '0'),
      };
    }, clipId);

    expect(stretched.stretchMode).toBe('repitch');
    expect(stretched.timeStretchRate).toBeLessThan(1);
    expect(stretched.contentOffset).toBe(0);
    expect(stretched.firstRectX).toBe(0);
  });
});
