import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, existsSync } from 'fs';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8001';

const serverPort = Number(process.env.VITE_PORT) || 5174;

export default defineConfig(async ({ command }) => {
  // Only load Claude terminal plugin in dev mode — it uses node-pty (native module)
  const plugins = [react(), tailwindcss()];
  if (command === 'serve') {
    const { claudeTerminalPlugin } = await import('./server/vite-plugin-claude-terminal');
    plugins.push(claudeTerminalPlugin());
  }

  // Copy WASM binary to public/ so it can be served as a static asset
  // (needed for AudioWorklet which can't use ESM imports)
  const wasmSrc = resolve(__dirname, 'src/wasm/pkg/ace_dsp_wasm_bg.wasm');
  const wasmDest = resolve(__dirname, 'public/ace_dsp_wasm_bg.wasm');
  if (existsSync(wasmSrc)) {
    copyFileSync(wasmSrc, wasmDest);
  }

  return {
    plugins,
    build: {
      // DAW apps inherently bundle large vendor deps (Strudel ~750KB, CodeMirror ~622KB)
      // and complex app code (~1191KB). The default 500KB limit produces false positives
      // here since these are lazy-loaded and gzip to ~200-320KB each.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              if (id.includes('tone')) {
                return 'vendor-tone';
              }
              if (id.includes('@strudel/mini') || id.includes('@strudel/core')) {
                return 'vendor-strudel-core';
              }
              if (id.includes('@strudel')) {
                return 'vendor-strudel';
              }
              if (id.includes('zustand') || id.includes('immer')) {
                return 'vendor-state';
              }
              if (id.includes('onnxruntime')) {
                return 'vendor-onnx';
              }
              if (id.includes('xterm') || id.includes('@xterm')) {
                return 'vendor-xterm';
              }
              if (id.includes('standardized-audio-context')) {
                return 'vendor-audio-ctx';
              }
              if (id.includes('jazz-midi') || id.includes('jzz')) {
                return 'vendor-midi';
              }
              if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) {
                return 'vendor-codemirror';
              }
              if (id.includes('@tonaljs') || id.includes('tonal')) {
                return 'vendor-tonal';
              }
              // Catch-all for remaining node_modules
              return 'vendor-misc';
            }
          },
        },
      },
    },
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
