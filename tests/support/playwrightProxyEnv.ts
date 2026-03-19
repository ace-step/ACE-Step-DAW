const LOCALHOST_BYPASS_HOSTS = ['127.0.0.1', 'localhost'] as const;
const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'GLOBAL_AGENT_HTTP_PROXY',
  'GLOBAL_AGENT_HTTPS_PROXY',
] as const;

export type ProxyEnvMap = Record<string, string | undefined>;

function mergeNoProxyHosts(...values: Array<string | undefined>): string {
  const merged = new Set<string>();

  for (const value of values) {
    if (!value) continue;

    for (const entry of value.split(',')) {
      const normalized = entry.trim();
      if (normalized) merged.add(normalized);
    }
  }

  for (const host of LOCALHOST_BYPASS_HOSTS) {
    merged.add(host);
  }

  return Array.from(merged).join(',');
}

export function createPlaywrightProxySafeEnv(sourceEnv: ProxyEnvMap = process.env): ProxyEnvMap {
  const env: ProxyEnvMap = { ...sourceEnv };
  const noProxy = mergeNoProxyHosts(sourceEnv.NO_PROXY, sourceEnv.no_proxy);

  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;

  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }

  return env;
}

export function applyPlaywrightProxySafeEnv(sourceEnv: ProxyEnvMap = process.env): void {
  const safeEnv = createPlaywrightProxySafeEnv(sourceEnv);

  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key];
  }

  process.env.NO_PROXY = safeEnv.NO_PROXY;
  process.env.no_proxy = safeEnv.no_proxy;
}
