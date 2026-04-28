import { useEffect, useRef, useState } from 'react';

/**
 * Announces messages to screen readers via an aria-live region.
 * Messages are set after a short delay to trigger re-announcement,
 * then cleared after 1 second.
 */
export function ScreenReaderAnnounce({
  message,
  politeness = 'polite',
}: {
  message: string;
  politeness?: 'polite' | 'assertive';
}) {
  const [announced, setAnnounced] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clearRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!message) return;

    // Clear first so screen reader re-reads even if same message
    setAnnounced('');
    timeoutRef.current = setTimeout(() => {
      setAnnounced(message);
      // Clear after screen reader has had time to announce
      clearRef.current = setTimeout(() => setAnnounced(''), 1000);
    }, 50);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, [message]);

  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
      data-testid="sr-announce"
    >
      {announced}
    </div>
  );
}
