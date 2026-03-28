/**
 * Vite plugin that provides a WebSocket endpoint for the Claude Code terminal.
 *
 * When a client connects to `/ws/claude`, the plugin spawns Claude Code as a
 * child process (via node-pty if available, or raw spawn) and bridges
 * stdin/stdout over the WebSocket so xterm.js can render the terminal.
 *
 * A separate WebSocket endpoint `/ws/mcp-bridge` is used by the DAW MCP
 * server to relay tool calls to the browser (Zustand store).
 */

import type { Plugin, ViteDevServer } from 'vite';
import { spawn, type ChildProcess } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

const GRACE_PERIOD_MS = 30_000;

interface SessionState {
  proc: ChildProcess | null;
  ws: WebSocket | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

function createSession(): SessionState {
  return { proc: null, ws: null, graceTimer: null };
}

function killSession(session: SessionState) {
  if (session.graceTimer) clearTimeout(session.graceTimer);
  session.proc?.kill();
  session.proc = null;
  session.ws = null;
}

function resolveClaudeBinary(): string {
  return process.env.CLAUDE_BINARY ?? 'claude';
}

function spawnClaude(cwd: string): ChildProcess {
  const bin = resolveClaudeBinary();

  // Build args for Claude Code CLI
  const args: string[] = [];

  // If an MCP config file exists, pass it
  const mcpConfigPath = `${cwd}/server/mcp-config.json`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').accessSync(mcpConfigPath);
    args.push('--mcp-config', mcpConfigPath);
  } catch {
    // No MCP config yet — that's fine
  }

  const proc = spawn(bin, args, {
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return proc;
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
        if (!session.proc || session.proc.exitCode !== null) {
          const cwd = server.config.root;
          try {
            session.proc = spawnClaude(cwd);

            session.proc.stdout?.on('data', (data: Buffer) => {
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(data.toString());
              }
            });

            session.proc.stderr?.on('data', (data: Buffer) => {
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(data.toString());
              }
            });

            session.proc.on('exit', (code) => {
              const msg = `\r\n\x1b[90m[Claude Code exited with code ${code}]\x1b[0m\r\n`;
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(msg);
              }
              session.proc = null;
            });

            session.proc.on('error', (err) => {
              const msg = err.message.includes('ENOENT')
                ? '\r\n\x1b[33mClaude Code not found.\x1b[0m\r\n' +
                  'Install it with: \x1b[1mnpm install -g @anthropic-ai/claude-code\x1b[0m\r\n' +
                  'Then restart the dev server.\r\n'
                : `\r\n\x1b[31mFailed to start Claude Code: ${err.message}\x1b[0m\r\n`;
              if (session.ws?.readyState === WebSocket.OPEN) {
                session.ws.send(msg);
              }
              session.proc = null;
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            ws.send(`\r\n\x1b[31mError: ${errMsg}\x1b[0m\r\n`);
          }
        }

        // Forward input from xterm.js to Claude's stdin
        ws.on('message', (data) => {
          if (session.proc?.stdin?.writable) {
            session.proc.stdin.write(typeof data === 'string' ? data : data.toString());
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
