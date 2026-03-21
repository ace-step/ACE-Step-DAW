import { useState, useEffect } from 'react';

/**
 * Tracks whether the Meta (Command on Mac) key is currently held down.
 * Resets on window blur to avoid "stuck" state when Cmd-tabbing away.
 */
export function useMetaKeyDown(): boolean {
  const [metaDown, setMetaDown] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta') setMetaDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') setMetaDown(false);
    };
    const onBlur = () => setMetaDown(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return metaDown;
}
