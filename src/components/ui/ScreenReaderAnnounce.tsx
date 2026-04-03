import { useEffect, useRef, useState } from 'react';

/**
 * Announces messages to screen readers via an aria-live region.
 * Messages are automatically cleared after announcement.
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

  useEffect(() => {
    if (!message) return;

    // Clear first so screen reader re-reads even if same message
    setAnnounced('');
    timeoutRef.current = setTimeout(() => setAnnounced(message), 50);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [message]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
      data-testid="sr-announce"
    >
      {announced}
    </div>
  );
}
