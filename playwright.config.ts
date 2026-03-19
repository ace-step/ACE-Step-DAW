import { defineConfig, devices } from '@playwright/test';

import {
  applyPlaywrightProxySafeEnv,
  createPlaywrightProxySafeEnv,
} from './tests/support/playwrightProxyEnv';

function deriveWorktreePort() {
  return Array.from(process.cwd()).reduce((hash, character) => {
    return (hash * 33 + character.charCodeAt(0)) % 200;
  }, 0);
}

const e2ePort = Number(process.env.E2E_PORT) || 5274 + deriveWorktreePort();
const safeProcessEnv = createPlaywrightProxySafeEnv(process.env);

applyPlaywrightProxySafeEnv(process.env);

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
    launchOptions: {
      env: safeProcessEnv,
    },
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
      ...safeProcessEnv,
      VITE_PORT: String(e2ePort),
    },
  },
});
