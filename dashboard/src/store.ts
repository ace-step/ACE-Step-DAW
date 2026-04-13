import { create } from 'zustand';
import type { DashboardSnapshot } from './types';

interface DashboardState {
  connected: boolean;
  snapshot: DashboardSnapshot | null;
  activityFilter: string;
  connect: () => void;
  disconnect: () => void;
  setActivityFilter: (filter: string) => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;

// Dashboard server always runs on port 5175, regardless of Vite HMR port
const WS_URL = `ws://${window.location.hostname}:5175/ws`;

export const useDashboardStore = create<DashboardState>()((set) => ({
  connected: false,
  snapshot: null,
  activityFilter: '',

  connect: () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    intentionalClose = false;
    ws = new WebSocket(WS_URL);

    ws.onopen = () => set({ connected: true });
    ws.onmessage = (e) => {
      try { set({ snapshot: JSON.parse(e.data) }); } catch {}
    };
    ws.onclose = () => {
      set({ connected: false });
      ws = null;
      // Only reconnect if not intentionally closed
      if (!intentionalClose) {
        reconnectTimer = setTimeout(() => useDashboardStore.getState().connect(), 3000);
      }
    };
    ws.onerror = () => ws?.close();
  },

  disconnect: () => {
    intentionalClose = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    ws?.close();
    ws = null;
    set({ connected: false });
  },

  setActivityFilter: (filter) => set({ activityFilter: filter }),
}));
