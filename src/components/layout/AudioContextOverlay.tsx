import { useState, useEffect, useCallback } from 'react';
import * as Tone from 'tone';

/**
 * Full-screen overlay shown when the browser's AudioContext is suspended.
 * Web browsers require a user gesture before allowing AudioContext to start.
 * Clicking/tapping/pressing Enter or Space resumes the audio context and dismisses the overlay.
 */
export function AudioContextOverlay() {
  const [suspended, setSuspended] = useState(() => {
    try {
      return Tone.getContext().rawContext.state === 'suspended';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let ctx: AudioContext | undefined;
    try {
      ctx = Tone.getContext().rawContext as AudioContext;
    } catch {
      return;
    }

    const handleStateChange = () => {
      setSuspended(ctx!.state === 'suspended');
    };

    ctx.addEventListener('statechange', handleStateChange);
    return () => {
      ctx!.removeEventListener('statechange', handleStateChange);
    };
  }, []);

  const handleResume = useCallback(async () => {
    try {
      await Tone.start();
      setSuspended(false);
    } catch {
      // If Tone.start() fails, still try raw resume
      try {
        const ctx = Tone.getContext().rawContext as AudioContext;
        await ctx.resume();
        setSuspended(false);
      } catch {
        // Could not resume — overlay stays visible
      }
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleResume();
      }
    },
    [handleResume],
  );

  if (!suspended) {
    return null;
  }

  return (
    <div
      role="button"
      aria-label="Enable audio"
      tabIndex={0}
      onClick={handleResume}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer select-none"
      data-testid="audio-context-overlay"
    >
      {/* Speaker icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-4 h-16 w-16 text-white/80"
        aria-hidden="true"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>

      <p className="text-lg font-medium text-white/90">
        Click anywhere to enable audio
      </p>
      <p className="mt-1 text-sm text-white/50">
        Your browser requires a user gesture to start audio playback
      </p>
    </div>
  );
}
