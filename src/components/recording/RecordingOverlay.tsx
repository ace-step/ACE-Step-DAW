/**
 * RecordingOverlay — renders cursor highlight + click animations + watermark
 * during video recording. All effects are DOM-based so they get captured
 * by Tab Capture automatically.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1179
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1181
 */
import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';

interface ClickRipple {
  id: number;
  x: number;
  y: number;
}

let rippleIdCounter = 0;

export function RecordingOverlay() {
  const status = useUIStore((s) => s.videoRecording.status);
  const isRecording = status === 'recording';

  if (!isRecording) return null;
  return (
    <>
      <CursorHighlight />
      <Watermark />
    </>
  );
}

function CursorHighlight() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<ClickRipple[]>([]);
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onClick = (e: MouseEvent) => {
      const id = ++rippleIdCounter;
      setRipples((prev) => [...prev, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 500);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mousedown', onClick, true);

    const tick = () => {
      setPos(mouseRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mousedown', onClick, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden="true">
      {/* Cursor glow */}
      <div
        className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: pos.x,
          top: pos.y,
          background: 'radial-gradient(circle, rgba(99,140,255,0.25) 0%, transparent 70%)',
        }}
      />
      {/* Click ripples */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-[ripple_0.5s_ease-out_forwards]"
          style={{ left: r.x, top: r.y }}
        >
          <div className="h-8 w-8 rounded-full border-2 border-blue-400/60" />
        </div>
      ))}
    </div>
  );
}

function Watermark() {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 rounded-md bg-black/20 px-2 py-1 backdrop-blur-sm"
      style={{ opacity: 0.4 }}
      aria-hidden="true"
    >
      <img src="/acestudio_icon.png" alt="" className="h-4 w-4 rounded-full" />
      <span className="text-[10px] font-medium text-white/80">ACE-Step DAW</span>
    </div>
  );
}
