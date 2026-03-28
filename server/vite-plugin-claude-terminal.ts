/**
 * Vite plugin that provides a WebSocket endpoint for the Claude Code terminal.
 *
 * Uses node-pty to spawn an interactive shell in a real pseudo-terminal (PTY),
 * then bridges PTY I/O over WebSocket so xterm.js can render and interact.
 *
 * The PTY is NOT spawned until the browser sends its actual terminal dimensions
 * via a `{ type: 'init', cols, rows }` message. This prevents the shell from
 * drawing its prompt at the wrong width and leaving garbled output.
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
  cwd: string;
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
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh';

  // Use a minimal ZDOTDIR to avoid loading the user's heavy prompt theme
  // (powerlevel10k, oh-my-zsh, starship, etc.) which uses Nerd Font glyphs
  // that don't render in web fonts. The user's PATH and env are inherited
  // from the Vite dev server process.
  const zdotdir = `${cwd}/server/terminal-profile`;

  // --no-globalrcs: skip /etc/zshrc and /etc/zshenv which inject macOS-specific
  // escape sequences (update_terminal_cwd, terminal title) that render as
  // garbled "WWWWW" text in xterm.js web fonts.
  const ptyProc = pty.spawn(shell, ['-i', '--no-globalrcs'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      ZDOTDIR: zdotdir,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      DAW_TERMINAL: '1',
    } as Record<string, string>,
  });

  return ptyProc as unknown as PtyProcess;
}

function attachPty(session: SessionState, ws: WebSocket, cols: number, rows: number) {
  try {
    session.ptyProc = spawnShell(session.cwd, cols, rows);

    session.ptyProc.onData((data: string) => {
      if (session.ws?.readyState === WebSocket.OPEN) {
        session.ws.send(data);
      }
    });

    session.ptyProc.onExit(({ exitCode }) => {
      const msg = `\r\n\x1b[90m[Shell exited with code ${exitCode}]\x1b[0m\r\n`;
      if (session.ws?.readyState === WebSocket.OPEN) {
        session.ws.send(msg);
      }
      session.ptyProc = null;
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ws.send(`\r\n\x1b[31mFailed to start shell: ${errMsg}\x1b[0m\r\n`);
  }
}

export function claudeTerminalPlugin(): Plugin {
  const session: SessionState = { ptyProc: null, ws: null, graceTimer: null, cwd: '' };

  return {
    name: 'vite-plugin-claude-terminal',
    configureServer(server: ViteDevServer) {
      session.cwd = server.config.root;

      const wssTerminal = new WebSocketServer({ noServer: true });
      const wssMcpBridge = new WebSocketServer({ noServer: true });
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

        // If PTY is already running (reconnect after tab switch), reattach
        // Otherwise, wait for 'init' message with real dimensions before spawning

        ws.on('message', (data) => {
          const str = typeof data === 'string' ? data : data.toString();

          // Handle JSON control messages
          if (str.startsWith('{')) {
            try {
              const msg = JSON.parse(str) as { type: string; cols?: number; rows?: number };

              if (msg.type === 'init' && msg.cols && msg.rows) {
                // First message from xterm.js: spawn PTY with exact dimensions
                if (!session.ptyProc) {
                  attachPty(session, ws, msg.cols, msg.rows);
                } else {
                  // PTY exists (reconnect) — just resize to match
                  session.ptyProc.resize(msg.cols, msg.rows);
                }
                return;
              }

              if (msg.type === 'resize' && msg.cols && msg.rows && session.ptyProc) {
                session.ptyProc.resize(msg.cols, msg.rows);
                return;
              }
            } catch { /* not JSON — fall through to PTY write */ }
          }

          // Regular input → PTY
          if (session.ptyProc) {
            session.ptyProc.write(str);
          }
        });

        ws.on('close', () => {
          session.ws = null;
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

      (server as unknown as Record<string, unknown>).__mcpBridgeClients = mcpBridgeClients;

      server.httpServer?.on('close', () => {
        killSession(session);
        wssTerminal.close();
        wssMcpBridge.close();
      });
    },
  };
}
