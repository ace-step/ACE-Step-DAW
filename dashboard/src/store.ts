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

export const useDashboardStore = create<DashboardState>()((set) => ({
  connected: false,
  snapshot: null,
  activityFilter: '',

  connect: () => {
    if (ws?.readyState === WebSocket.OPEN) return;
    const url = `ws://${window.location.hostname}:${window.location.port}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => set({ connected: true });
    ws.onmessage = (e) => {
      try { set({ snapshot: JSON.parse(e.data) }); } catch {}
    };
    ws.onclose = () => {
      set({ connected: false });
      ws = null;
      reconnectTimer = setTimeout(() => useDashboardStore.getState().connect(), 3000);
    };
    ws.onerror = () => ws?.close();
  },

  disconnect: () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
    set({ connected: false });
  },

  setActivityFilter: (filter) => set({ activityFilter: filter }),
}));
