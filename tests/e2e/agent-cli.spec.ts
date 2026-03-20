import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

test.describe('Agent CLI', () => {
  test('exposes __agentCli in the browser', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.__agentCli !== 'undefined');

    const commands = await page.evaluate(() => window.__agentCli.listCommands());
    expect(commands.some((item) => item.id === 'project.create')).toBe(true);
    expect(commands.some((item) => item.id === 'pianoroll.note.add')).toBe(true);
    expect(commands.some((item) => item.id === 'postProduction.startRepair')).toBe(true);
  });

  test('runs a batch workflow through the terminal CLI wrapper', async ({ baseURL }) => {
    const workflowPath = path.join(os.tmpdir(), `ace-step-agent-cli-${Date.now()}.json`);
    await fs.writeFile(workflowPath, JSON.stringify([
      { id: 'project.create', args: { name: 'CLI Workflow', bpm: 124 } },
      { id: 'postProduction.open', args: { taskType: 'repair' } },
      { id: 'postProduction.getTaskState' },
    ], null, 2), 'utf8');

    const { stdout } = await execFileAsync('node', [
      'scripts/cli/daw-cli.mjs',
      '--url',
      baseURL ?? 'http://127.0.0.1:5173',
      'batch',
      workflowPath,
    ], { cwd: process.cwd() });

    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results[2].ok).toBe(true);
    expect(result.results[1].value.task.taskType).toBe('repair');
    expect(result.results[2].value.taskType).toBe('repair');
  });
});
