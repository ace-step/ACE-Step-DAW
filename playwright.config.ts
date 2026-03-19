import { defineConfig, devices } from '@playwright/test';

function mergeNoProxyValue(value: string | undefined) {
  const entries = new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  entries.add('127.0.0.1');
  entries.add('localhost');
  return Array.from(entries).join(',');
}

function deriveWorktreePort() {
  return Array.from(process.cwd()).reduce((hash, character) => {
    return (hash * 33 + character.charCodeAt(0)) % 200;
  }, 0);
}

const noProxyValue = mergeNoProxyValue(process.env.NO_PROXY ?? process.env.no_proxy);

process.env.NO_PROXY = noProxyValue;
process.env.no_proxy = noProxyValue;
process.env.GLOBAL_AGENT_NO_PROXY = noProxyValue;

const e2ePort = Number(process.env.E2E_PORT) || 5274 + deriveWorktreePort();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_PORT: String(e2ePort),
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
  },
});
