import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8001';

const serverPort = Number(process.env.VITE_PORT) || 5174;

export default defineConfig(async ({ command }) => {
  // Only load Claude terminal plugin in dev mode — it uses node-pty (native module)
  const plugins = [react(), tailwindcss()];
  if (command === 'serve') {
    const { claudeTerminalPlugin } = await import('./server/vite-plugin-claude-terminal');
    plugins.push(claudeTerminalPlugin());
  }

  return {
    plugins,
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        // Stub out @kabelsalat/web — Strudel's optional modular synth engine
        // has a broken export in v0.4.1. We don't use it; we use queryArc only.
        '@kabelsalat/web': resolve(__dirname, 'src/stubs/kabelsalat-web.ts'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: serverPort,
      strictPort: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          timeout: 5 * 60 * 1000,
          proxyTimeout: 5 * 60 * 1000,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (res && 'writeHead' in res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Backend unavailable' }));
              }
            });
          },
        },
      },
    },
  };
});
