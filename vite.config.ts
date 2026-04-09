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
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(rawId: string) {
            // Normalize path separators for Windows compatibility
            const id = rawId.replace(/\\/g, '/');
            // Tone.js — large audio synthesis library (~800 KB)
            if (id.includes('node_modules/tone/') || id.includes('node_modules/standardized-audio-context/')) {
              return 'vendor-tone';
            }
            // Strudel — live-coding pattern language, split into sub-chunks
            // draw depends only on core, used by both webaudio and codemirror
            if (id.includes('node_modules/@strudel/core/') || id.includes('node_modules/@strudel/mini/') || id.includes('node_modules/@strudel/tonal/') || id.includes('node_modules/@strudel/draw/')) {
              return 'vendor-strudel-core';
            }
            if (id.includes('node_modules/@strudel/webaudio/') || id.includes('node_modules/@strudel/soundfonts/') || id.includes('node_modules/superdough/') || id.includes('node_modules/supradough/')) {
              return 'vendor-strudel-audio';
            }
            if (id.includes('node_modules/@strudel/codemirror/') || id.includes('node_modules/@strudel/transpiler/')) {
              return 'vendor-strudel-editor';
            }
            if (id.includes('node_modules/@strudel/')) {
              return 'vendor-strudel-misc';
            }
            // CodeMirror — split into core and extensions
            if (id.includes('node_modules/@codemirror/state/') || id.includes('node_modules/@codemirror/view/') || id.includes('node_modules/@lezer/') || id.includes('node_modules/codemirror/')) {
              return 'vendor-codemirror-core';
            }
            if (id.includes('node_modules/@codemirror/')) {
              return 'vendor-codemirror-ext';
            }
            // Replit codemirror keybinding extensions (vim, emacs, vscode)
            if (id.includes('node_modules/@replit/codemirror-')) {
              return 'vendor-codemirror-keymaps';
            }
            // xterm — terminal emulation (already somewhat split, ensure isolation)
            if (id.includes('node_modules/xterm/') || id.includes('node_modules/@xterm/')) {
              return 'vendor-xterm';
            }
            // Video processing — mp4-muxer + web-demuxer
            if (id.includes('node_modules/mp4-muxer/') || id.includes('node_modules/web-demuxer/')) {
              return 'vendor-video';
            }
            // React core — react, react-dom, scheduler
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }
            // Audio engine layer — force into dedicated chunks
            // Shared by many lazy components; prevent Rollup from promoting to entry chunk
            // Effects engine — largest engine module, separate chunk
            if ((id.includes('/src/engine/EffectsEngine') || id.includes('/src/engine/dsp/')) && !id.includes('__tests__')) {
              return 'app-engine-fx';
            }
            // Export/offline rendering — only needed for bounce/export operations
            if ((id.includes('/src/engine/exportMix') || id.includes('/src/engine/offlineRender')) && !id.includes('__tests__')) {
              return 'app-engine-export';
            }
            // Core audio engine + remaining modules
            if (id.includes('/src/engine/') && !id.includes('__tests__')) {
              return 'app-engine';
            }
            if (id.includes('/src/hooks/useAudioEngine') || id.includes('/src/hooks/useTransport.ts') || id.includes('/src/hooks/useEffectsSync') || id.includes('/src/hooks/useRecording')) {
              return 'app-engine';
            }
          },
        },
      },
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
