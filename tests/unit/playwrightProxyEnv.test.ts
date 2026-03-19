import { describe, expect, it } from 'vitest';

import {
  applyPlaywrightProxySafeEnv,
  createPlaywrightProxySafeEnv,
} from '../support/playwrightProxyEnv';

describe('createPlaywrightProxySafeEnv', () => {
  it('removes inherited proxy variables and preserves localhost bypass', () => {
    const safeEnv = createPlaywrightProxySafeEnv({
      HTTP_PROXY: 'http://127.0.0.1:10080',
      HTTPS_PROXY: 'http://127.0.0.1:10080',
      GLOBAL_AGENT_HTTP_PROXY: 'http://127.0.0.1:10080',
      NO_PROXY: 'example.internal',
    });

    expect(safeEnv.HTTP_PROXY).toBeUndefined();
    expect(safeEnv.HTTPS_PROXY).toBeUndefined();
    expect(safeEnv.GLOBAL_AGENT_HTTP_PROXY).toBeUndefined();
    expect(safeEnv.NO_PROXY).toBe('example.internal,127.0.0.1,localhost');
    expect(safeEnv.no_proxy).toBe('example.internal,127.0.0.1,localhost');
  });
});

describe('applyPlaywrightProxySafeEnv', () => {
  it('updates process.env in place for Playwright child processes', () => {
    const original = {
      HTTP_PROXY: process.env.HTTP_PROXY,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      GLOBAL_AGENT_HTTP_PROXY: process.env.GLOBAL_AGENT_HTTP_PROXY,
      GLOBAL_AGENT_HTTPS_PROXY: process.env.GLOBAL_AGENT_HTTPS_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy,
    };

    process.env.HTTP_PROXY = 'http://127.0.0.1:10080';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10080';
    process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://127.0.0.1:10080';
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;

    applyPlaywrightProxySafeEnv();

    expect(process.env.HTTP_PROXY).toBeUndefined();
    expect(process.env.HTTPS_PROXY).toBeUndefined();
    expect(process.env.GLOBAL_AGENT_HTTP_PROXY).toBeUndefined();
    expect(process.env.NO_PROXY).toBe('127.0.0.1,localhost');
    expect(process.env.no_proxy).toBe('127.0.0.1,localhost');

    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
});
