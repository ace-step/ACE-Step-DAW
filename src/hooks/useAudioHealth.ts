import { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureHealthSnapshot,
  deriveHealthStatus,
  detectXrun,
  enumerateAudioDevices,
  type XrunDetector,
} from '../services/audioHealthMonitor';
import { getExistingAudioEngine } from './useAudioEngine';
import { useUIStore } from '../store/uiStore';
import type { AudioHealthSnapshot, AudioHealthStatus, AudioDeviceInfo } from '../types/audioHealth';

/** Polling interval for health snapshots (ms). */
const POLL_INTERVAL_MS = 500;

/** Time window (ms) for counting recent clipping events. */
const CLIP_WINDOW_MS = 10_000;

export interface AudioHealthHook {
  snapshot: AudioHealthSnapshot | null;
  status: AudioHealthStatus;
  devices: AudioDeviceInfo[];
  xrunCount: number;
  recentClipCount: number;
  panelOpen: boolean;
  togglePanel: () => void;
}

export function useAudioHealth(): AudioHealthHook {
  const [snapshot, setSnapshot] = useState<AudioHealthSnapshot | null>(null);
  const [status, setStatus] = useState<AudioHealthStatus>('inactive');
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const panelOpen = useUIStore((s) => s.showAudioHealthPanel);
  const setShowAudioHealthPanel = useUIStore((s) => s.setShowAudioHealthPanel);

  const xrunDetectorRef = useRef<XrunDetector>({ lastContextTime: 0, lastWallTime: 0, xrunCount: 0 });
  const clipTimestampsRef = useRef<number[]>([]);
  const xrunCountRef = useRef(0);
  const recentClipCountRef = useRef(0);

  // Force re-render refs into state for consumers
  const [xrunCount, setXrunCount] = useState(0);
  const [recentClipCount, setRecentClipCount] = useState(0);

  const togglePanel = useCallback(() => {
    setShowAudioHealthPanel(!panelOpen);
  }, [panelOpen, setShowAudioHealthPanel]);

  // Enumerate devices on mount
  useEffect(() => {
    void enumerateAudioDevices().then(setDevices);
  }, []);

  // Polling loop
  useEffect(() => {
    const interval = setInterval(() => {
      const engine = getExistingAudioEngine();
      if (!engine) {
        setSnapshot(null);
        setStatus('inactive');
        return;
      }

      const snap = captureHealthSnapshot(engine as never);
      setSnapshot(snap);

      // Xrun detection
      if (snap.contextState === 'running') {
        detectXrun(xrunDetectorRef.current, snap.currentTime, Date.now());
        xrunCountRef.current = xrunDetectorRef.current.xrunCount;
        setXrunCount(xrunCountRef.current);
      }

      // Clipping tracking
      if (snap.masterClipping) {
        clipTimestampsRef.current.push(snap.timestamp);
      }
      // Prune old clips outside window
      const cutoff = Date.now() - CLIP_WINDOW_MS;
      clipTimestampsRef.current = clipTimestampsRef.current.filter((t) => t > cutoff);
      recentClipCountRef.current = clipTimestampsRef.current.length;
      setRecentClipCount(recentClipCountRef.current);

      // Derive status
      const derivedStatus = deriveHealthStatus(snap, recentClipCountRef.current, xrunCountRef.current);
      setStatus(derivedStatus);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return {
    snapshot,
    status,
    devices,
    xrunCount,
    recentClipCount,
    panelOpen,
    togglePanel,
  };
}
