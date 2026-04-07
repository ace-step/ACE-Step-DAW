import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
} from '../ui/ContextMenu';
import type { StretchMode, Clip } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { detectBpm } from '../../utils/audioWarp';

const STRETCH_MODES: { mode: StretchMode; label: string; desc: string }[] = [
  { mode: 'repitch', label: 'Repitch', desc: 'Speed change (pitch follows)' },
  { mode: 'beats', label: 'Beats', desc: 'Best for drums/percussion' },
  { mode: 'tones', label: 'Tones', desc: 'Best for monophonic material' },
  { mode: 'complex', label: 'Complex', desc: 'Polyphonic audio' },
  { mode: 'complexPro', label: 'Complex Pro', desc: 'Polyphonic + transients' },
  { mode: 'texture', label: 'Texture', desc: 'Ambient / pad material' },
];

interface WarpStretchSubmenuProps {
  clip: Clip;
  openLeft?: boolean;
  onClose: () => void;
}

export function WarpStretchSubmenu({
  clip,
  openLeft = false,
  onClose,
}: WarpStretchSubmenuProps) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const setClipStretchMode = useProjectStore((s) => s.setClipStretchMode);
  const tempoMatchClip = useProjectStore((s) => s.tempoMatchClip);
  const resetWarp = useProjectStore((s) => s.resetWarp);
  const setClipPitchShift = useProjectStore((s) => s.setClipPitchShift);

  const currentMode = clip.stretchMode ?? 'repitch';
  const currentPitch = clip.pitchShift ?? 0;
  const hasAudio = !!(clip.waveformPeaks && clip.waveformPeaks.length > 0);

  const openSubmenuFn = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    hoverTimerRef.current = setTimeout(() => setShowSubmenu(true), 80);
  }, []);

  const closeSubmenuFn = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    leaveTimerRef.current = setTimeout(() => setShowSubmenu(false), 150);
  }, []);

  const handleMouseEnterSubmenu = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    };
  }, []);

  const handleDetectBpm = useCallback(() => {
    if (!clip.waveformPeaks || clip.waveformPeaks.length === 0) return;
    const audioDuration = clip.audioDuration ?? clip.duration;
    if (!audioDuration || audioDuration <= 0) return;
    setDetecting(true);
    // Use setTimeout to avoid blocking UI, with cleanup on unmount
    detectTimerRef.current = setTimeout(() => {
      const peaks = new Float32Array(clip.waveformPeaks!);
      const sampleRate = peaks.length / audioDuration;
      const bpm = detectBpm(peaks, sampleRate);
      if (mountedRef.current) {
        setDetectedBpm(bpm);
        setDetecting(false);
      }
    }, 0);
  }, [clip]);

  const handleTempoMatch = useCallback(() => {
    if (detectedBpm) {
      tempoMatchClip(clip.id, detectedBpm);
      // Set to complex mode for quality stretching
      if (!clip.stretchMode || clip.stretchMode === 'repitch') {
        setClipStretchMode(clip.id, 'complex');
      }
    }
    onClose();
  }, [clip.id, clip.stretchMode, detectedBpm, tempoMatchClip, setClipStretchMode, onClose]);

  const handleResetWarp = useCallback(() => {
    resetWarp(clip.id);
    onClose();
  }, [clip.id, resetWarp, onClose]);

  const handleSetMode = useCallback((mode: StretchMode) => {
    setClipStretchMode(clip.id, mode);
    onClose();
  }, [clip.id, setClipStretchMode, onClose]);

  const handlePitchShift = useCallback((delta: number) => {
    const newPitch = Math.max(-24, Math.min(24, currentPitch + delta));
    setClipPitchShift(clip.id, newPitch);
  }, [clip.id, currentPitch, setClipPitchShift]);

  return (
    <div
      className="relative"
      onMouseEnter={openSubmenuFn}
      onMouseLeave={closeSubmenuFn}
    >
      <ContextMenuItem
        label="Warp & Stretch"
        onClick={() => setShowSubmenu((v) => !v)}
        color="#fbbf24"
        shortcut="▸"
      />

      {showSubmenu && (
        <div
          ref={submenuRef}
          className={`absolute top-0 z-50 ${openLeft ? 'right-full -mr-1' : 'left-full -ml-1'}`}
          onMouseEnter={handleMouseEnterSubmenu}
          onMouseLeave={closeSubmenuFn}
        >
          <ContextMenuSubmenu>
            {/* Stretch Mode Section */}
            <div className="px-2 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">
              Stretch Mode
            </div>
            {STRETCH_MODES.map(({ mode, label, desc }) => (
              <ContextMenuItem
                key={mode}
                label={`${currentMode === mode ? '● ' : '  '}${label}`}
                onClick={() => handleSetMode(mode)}
                color={currentMode === mode ? '#fbbf24' : undefined}
              />
            ))}

            <ContextMenuSeparator />

            {/* Pitch Shift */}
            <div className="px-2 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">
              Pitch: {currentPitch > 0 ? '+' : ''}{currentPitch} st
            </div>
            <div className="flex gap-1 px-2 py-1">
              <button
                className="flex-1 text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                onClick={() => handlePitchShift(-1)}
              >
                −1
              </button>
              <button
                className="flex-1 text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                onClick={() => handlePitchShift(1)}
              >
                +1
              </button>
              <button
                className="flex-1 text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                onClick={() => { setClipPitchShift(clip.id, 0); }}
              >
                Reset
              </button>
            </div>

            <ContextMenuSeparator />

            {/* BPM Detection */}
            {hasAudio && !detectedBpm && (
              <ContextMenuItem
                label={detecting ? 'Detecting...' : 'Detect BPM'}
                onClick={handleDetectBpm}
                disabled={detecting}
              />
            )}
            {detectedBpm && (
              <>
                <div className="px-2 py-1 text-[11px] text-amber-400">
                  Detected: {detectedBpm} BPM
                </div>
                <ContextMenuItem
                  label="Match Project Tempo"
                  onClick={handleTempoMatch}
                  color="#6ee7b7"
                />
              </>
            )}

            <ContextMenuSeparator />

            {/* Reset */}
            <ContextMenuItem
              label="Reset All Warp"
              onClick={handleResetWarp}
              danger
            />
          </ContextMenuSubmenu>
        </div>
      )}
    </div>
  );
}
