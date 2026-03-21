/**
 * Covered story ids:
 * - GEN-002
 *
 * Persona: user waiting on streamed generation feedback
 * Workflow summary: verify progress and early-result behavior while generation
 * is still in flight.
 * Why this test exists: protects visible generation status semantics.
 * Left to other layers: backend music quality and manual usability review.
 */
import { expect, test } from '@playwright/test';

function createWavBuffer(durationSeconds = 0.1, sampleRate = 44100): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

test.describe('Streaming Generation Variations', () => {
  test('shows the first completed variation before the full batch finishes', async ({ page }) => {
    test.setTimeout(120000);
    const wavBuffer = createWavBuffer();
    let releaseCount = 0;
    const queryCounts = new Map<string, number>();

    await page.route('**/api/release_task', async (route) => {
      releaseCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { task_id: `variation-task-${releaseCount}`, status: 'queued' },
          code: 0,
          error: null,
          timestamp: Date.now(),
          extra: null,
        }),
      });
    });

    await page.route('**/api/query_result', async (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData() ?? '{}') as { task_id_list?: string[] };
      const taskId = body.task_id_list?.[0] ?? 'unknown-task';
      const count = (queryCounts.get(taskId) ?? 0) + 1;
      queryCounts.set(taskId, count);

      const isFirstTask = taskId.endsWith('1');
      const payload = isFirstTask || count > 1
        ? [{
            task_id: taskId,
            status: 1,
            result: JSON.stringify([{
              file: `/generated/${taskId}.wav`,
              wave: '',
              status: 1,
              create_time: Date.now(),
              env: 'test',
              prompt: 'streamed variation',
              lyrics: '',
              metas: {
                bpm: 128,
                keyscale: 'E minor',
                timesignature: '4/4',
              },
            }]),
            progress_text: 'Generation complete',
          }]
        : [{
            task_id: taskId,
            status: 0,
            result: '[]',
            progress_text: 'Sampling variation...',
          }];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: payload,
          code: 0,
          error: null,
          timestamp: Date.now(),
          extra: null,
        }),
      });
    });

    await page.route('**/api/v1/audio?path=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: wavBuffer,
      });
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 120000 });
    await page.evaluate(() => {
      const browserWindow = window as unknown as {
        __store: {
          getState: () => {
            createProject: (params: { name: string; bpm: number; keyScale: string }) => void;
            addTrack: (trackName: string) => { id: string };
            setShowGenerationPanel: (value: boolean) => void;
          };
        };
      };

      browserWindow.__store.getState().createProject({
        name: 'Streaming Variations Test',
        bpm: 128,
        keyScale: 'E minor',
      });
      browserWindow.__store.getState().addTrack('drums');
      browserWindow.__store.getState().setShowGenerationPanel(true);
    });

    await page.mouse.click(20, 20);
    await expect(page.getByRole('complementary', { name: 'AI generation panel' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Generation prompt' }).fill('punchy breakbeat with airy synth textures');
    await page.getByRole('combobox', { name: 'Generation variation count' }).selectOption('2');
    await page.getByTestId('generation-generate-btn').click();

    await page.waitForFunction(() => {
      const session = (window as any).__store.getState().variationSession;
      return session
        && session.variations[0]?.status === 'done'
        && session.variations[1]?.status === 'generating';
    });

    await expect(page.getByTestId('variation-card-0')).toContainText('Ready');
    await expect(page.getByTestId('variation-card-1')).toContainText('Generating');

    const partialState = await page.evaluate(() => {
      const session = (window as any).__store.getState().variationSession;
      return session.variations.map((variation: {
        status: string;
        clipId: string | null;
      }) => ({
        status: variation.status,
        hasClipId: Boolean(variation.clipId),
      }));
    });

    expect(partialState).toEqual([
      { status: 'done', hasClipId: true },
      { status: 'generating', hasClipId: true },
    ]);

    await page.waitForFunction(() => {
      const session = (window as any).__store.getState().variationSession;
      return session && session.status === 'done';
    });
  });
});
