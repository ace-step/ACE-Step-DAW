import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const WS_URL = `ws://${window.location.hostname}:${window.location.port}/ws/claude`;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function ClaudeTerminal() {
  const show = useUIStore((state) => state.showAIAssistant);
  const setShow = useUIStore((state) => state.setShowAIAssistant);

  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<import('xterm').Terminal | null>(null);
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      const term = termInstanceRef.current;
      if (term && typeof event.data === 'string') {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptRef.current += 1;
          connectWebSocket();
        }, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // Initialize xterm.js
  useEffect(() => {
    if (!show || !terminalRef.current) return;

    let disposed = false;

    const init = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      if (disposed || !terminalRef.current) return;

      // Don't re-create if already initialized
      if (termInstanceRef.current) {
        fitAddonRef.current?.fit();
        return;
      }

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Cascadia Code", monospace',
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#7c6ef6',
          cursorAccent: '#1a1a2e',
          selectionBackground: '#7c6ef644',
          black: '#1a1a2e',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#facc15',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#e0e0e0',
          brightBlack: '#6b7280',
          brightRed: '#fca5a5',
          brightGreen: '#86efac',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9',
          brightWhite: '#f9fafb',
        },
        scrollback: 5000,
        allowProposedApi: true,
      });

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      termInstanceRef.current = term;
      fitAddonRef.current = fitAddon;

      // Forward input to WebSocket
      term.onData((data) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Write welcome message
      term.writeln('\x1b[1;35m  Claude Code \x1b[0m\x1b[90m— DAW Assistant\x1b[0m');
      term.writeln('');

      // Connect
      connectWebSocket();
    };

    void init();

    return () => {
      disposed = true;
    };
  }, [show, connectWebSocket]);

  // Handle resize
  useEffect(() => {
    if (!show || !terminalRef.current) return;

    const container = terminalRef.current;
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [show]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reconnectTimerRef.current && clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      termInstanceRef.current?.dispose();
      termInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  if (!show) return null;

  const statusColor =
    status === 'connected' ? 'bg-emerald-500'
    : status === 'connecting' ? 'bg-yellow-500'
    : 'bg-zinc-500';

  const statusLabel =
    status === 'connected' ? 'Connected'
    : status === 'connecting' ? 'Connecting...'
    : 'Disconnected';

  return (
    <div
      className="fixed top-11 right-0 bottom-6 flex w-[400px] flex-col border-l border-[#333] bg-[#1a1a2e] shadow-xl"
      style={{ zIndex: Z.panel }}
      data-testid="claude-terminal"
      role="complementary"
      aria-label="Claude Code Terminal"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="50 50 412 412" fill="currentColor" className="text-daw-accent" aria-hidden="true">
            <path d="M142.27 316.619l73.655-41.326 1.238-3.589-1.238-1.996-3.589-.001-12.31-.759-42.084-1.138-36.498-1.516-35.361-1.896-8.897-1.895-8.34-10.995.859-5.484 7.482-5.03 10.717.935 23.683 1.617 35.537 2.452 25.782 1.517 38.193 3.968h6.064l.86-2.451-2.073-1.517-1.618-1.517-36.776-24.922-39.81-26.338-20.852-15.166-11.273-7.683-5.687-7.204-2.451-15.721 10.237-11.273 13.75.935 3.513.936 13.928 10.716 29.749 23.027 38.848 28.612 5.687 4.727 2.275-1.617.278-1.138-2.553-4.271-21.13-38.193-22.546-38.848-10.035-16.101-2.654-9.655c-.935-3.968-1.617-7.304-1.617-11.374l11.652-15.823 6.445-2.073 15.545 2.073 6.547 5.687 9.655 22.092 15.646 34.78 24.265 47.291 7.103 14.028 3.791 12.992 1.416 3.968 2.449-.001v-2.275l1.997-26.641 3.69-32.707 3.589-42.084 1.239-11.854 5.863-14.206 11.652-7.683 9.099 4.348 7.482 10.716-1.036 6.926-4.449 28.915-8.72 45.294-5.687 30.331h3.313l3.792-3.791 15.342-20.372 25.782-32.227 11.374-12.789 13.27-14.129 8.517-6.724 16.1-.001 11.854 17.617-5.307 18.199-16.581 21.029-13.75 17.819-19.716 26.54-12.309 21.231 1.138 1.694 2.932-.278 44.536-9.479 24.062-4.347 28.714-4.928 12.992 6.066 1.416 6.167-5.106 12.613-30.71 7.583-36.018 7.204-53.636 12.689-.657.48.758.935 24.164 2.275 10.337.556h25.301l47.114 3.514 12.309 8.139 7.381 9.959-1.238 7.583-18.957 9.655-25.579-6.066-59.702-14.205-20.474-5.106-2.83-.001v1.694l17.061 16.682 31.266 28.233 39.152 36.397 1.997 8.999-5.03 7.102-5.307-.758-34.401-25.883-13.27-11.651-30.053-25.302-1.996-.001v2.654l6.926 10.136 36.574 54.975 1.895 16.859-2.653 5.485-9.479 3.311-10.414-1.895-21.408-30.054-22.092-33.844-17.819-30.331-2.173 1.238-10.515 113.261-4.929 5.788-11.374 4.348-9.478-7.204-5.03-11.652 5.03-23.027 6.066-30.052 4.928-23.886 4.449-29.674 2.654-9.858-.177-.657-2.173.278-22.37 30.71-34.021 45.977-26.919 28.815-6.445 2.553-11.173-5.789 1.037-10.337 6.243-9.2 37.257-47.392 22.47-29.371 14.508-16.961-.101-2.451h-.859l-98.954 64.251-17.618 2.275-7.583-7.103.936-11.652 3.589-3.791 29.749-20.474z" />
          </svg>
          <span className="text-[12px] font-medium text-zinc-200">Claude Code</span>
          <div className="flex items-center gap-1.5 ml-2">
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
            <span className="text-[10px] text-zinc-500">{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status === 'disconnected' && (
            <button
              onClick={connectWebSocket}
              className="flex h-6 items-center gap-1 rounded px-2 text-[10px] text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
              title="Reconnect"
            >
              Reconnect
            </button>
          )}
          <button
            onClick={() => setShow(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-[#333] hover:text-zinc-300"
            title="Close (Cmd+/)"
            aria-label="Close Claude Code Terminal"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 p-1"
        data-testid="claude-terminal-container"
      />
    </div>
  );
}
