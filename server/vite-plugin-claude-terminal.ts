/**
 * Vite plugin that provides a WebSocket endpoint for the Claude Code terminal.
 *
 * Uses node-pty to spawn Claude Code in a real pseudo-terminal (PTY), then
 * bridges PTY I/O over WebSocket so xterm.js can render and interact with
 * the full interactive CLI — colors, cursor movement, key handling all work.
 *
 * A separate WebSocket endpoint `/ws/mcp-bridge` is used by the DAW MCP
 * server to relay tool calls to the browser (Zustand store).
 */

import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

// node-pty is a native module that can't be ESM-imported — use createRequire
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const pty = require_('node-pty') as typeof import('node-pty');

const GRACE_PERIOD_MS = 300_000; // 5 minutes — Claude Code may be running long tasks
const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

interface PtyProcess {
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  pid: number;
}

interface SessionState {
  ptyProc: PtyProcess | null;
  ws: WebSocket | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

function createSession(): SessionState {
  return { ptyProc: null, ws: null, graceTimer: null };
}

function killSession(session: SessionState) {
  if (session.graceTimer) clearTimeout(session.graceTimer);
  if (session.ptyProc) {
    try { session.ptyProc.kill(); } catch { /* already dead */ }
  }
  session.ptyProc = null;
  session.ws = null;
}

function spawnShell(cwd: string, cols: number, rows: number): PtyProcess {
  const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL ?? '/bin/zsh';

  // Spawn an interactive login shell in the project directory.
  // The user types `claude` to start Claude Code — this picks up their
  // shell aliases (e.g. `claude --dangerously-skip-permissions`) and
  // ensures all env vars / PATH entries are available.
  const ptyProc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
    } as Record<string, string>,
  });

  return ptyProc as unknown as PtyProcess;
}

export function claudeTerminalPlugin(): Plugin {
  const session = createSession();

  return {
    name: 'vite-plugin-claude-terminal',
    configureServer(server: ViteDevServer) {
      const wssTerminal = new WebSocketServer({ noServer: true });
      const wssMcpBridge = new WebSocketServer({ noServer: true });

      // Store MCP bridge connections for the MCP server to use
      const mcpBridgeClients = new Set<WebSocket>();

      server.httpServer?.on(
        'upgrade',
        (req: IncomingMessage, socket: Duplex, head: Buffer) => {
          if (req.url === '/ws/claude') {
            wssTerminal.handleUpgrade(req, socket, head, (ws) => {
              wssTerminal.emit('connection', ws, req);
            });
          } else if (req.url === '/ws/mcp-bridge') {
            wssMcpBridge.handleUpgrade(req, socket, head, (ws) => {
              wssMcpBridge.emit('connection', ws, req);
            });
          }
        },
      );

      // ── Terminal WebSocket ──
      wssTerminal.on('connection', (ws: WebSocket) => {
        // Cancel grace period if reconnecting
        if (session.graceTimer) {
          clearTimeout(session.graceTimer);
          session.graceTimer = null;
        }

        session.ws = ws;

        // Spawn Claude if not already running
        if (!session.ptyProc) {
          const cwd = server.config.root;
          try {
            session.ptyProc = spawnShell(cwd, DEFAULT_COLS, DEFAULT_ROWS);

            session.ptyProc.onData((data: string) => {
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(data);
              }
            });

            session.ptyProc.onExit(({ exitCode }) => {
              const msg = `\r\n\x1b[90m[Claude Code exited with code ${exitCode}]\x1b[0m\r\n`;
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(msg);
              }
              session.ptyProc = null;
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const msg = errMsg.includes('ENOENT') || errMsg.includes('not found')
              ? '\r\n\x1b[33mClaude Code not found.\x1b[0m\r\n' +
                'Install it with: \x1b[1mnpm install -g @anthropic-ai/claude-code\x1b[0m\r\n' +
                'Then restart the dev server.\r\n'
              : `\r\n\x1b[31mFailed to start Claude Code: ${errMsg}\x1b[0m\r\n`;
            ws.send(msg);
          }
        }

        // Forward input from xterm.js to PTY
        ws.on('message', (data) => {
          const str = typeof data === 'string' ? data : data.toString();

          // Handle resize messages: { type: 'resize', cols, rows }
          if (str.startsWith('{"type":"resize"')) {
            try {
              const msg = JSON.parse(str) as { type: string; cols: number; rows: number };
              if (msg.type === 'resize' && session.ptyProc) {
                session.ptyProc.resize(msg.cols, msg.rows);
              }
            } catch { /* ignore bad JSON */ }
            return;
          }

          if (session.ptyProc) {
            session.ptyProc.write(str);
          }
        });

        ws.on('close', () => {
          session.ws = null;
          // Grace period before killing the process
          session.graceTimer = setTimeout(() => {
            killSession(session);
          }, GRACE_PERIOD_MS);
        });
      });

      // ── MCP Bridge WebSocket ──
      wssMcpBridge.on('connection', (ws: WebSocket) => {
        mcpBridgeClients.add(ws);
        ws.on('close', () => mcpBridgeClients.delete(ws));
      });

      // Expose bridge clients for the MCP server
      (server as unknown as Record<string, unknown>).__mcpBridgeClients = mcpBridgeClients;

      // Clean up on server close
      server.httpServer?.on('close', () => {
        killSession(session);
        wssTerminal.close();
        wssMcpBridge.close();
      });
    },
  };
}
