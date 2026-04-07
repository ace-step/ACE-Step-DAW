/**
 * Skip navigation links — visually hidden until focused (WCAG 2.4.1).
 * Renders anchor links that let keyboard users jump past the toolbar
 * directly to the main content, timeline, or mixer regions.
 */
export function SkipLinks() {
  return (
    <nav aria-label="Skip navigation">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-1 focus:left-1 focus:z-[9999] focus:px-3 focus:py-1.5 focus:rounded focus:bg-daw-accent focus:text-white focus:text-xs focus:font-medium focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>
      <a
        href="#timeline-region"
        className="sr-only focus:not-sr-only focus:fixed focus:top-1 focus:left-40 focus:z-[9999] focus:px-3 focus:py-1.5 focus:rounded focus:bg-daw-accent focus:text-white focus:text-xs focus:font-medium focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to timeline
      </a>
      <a
        href="#mixer-region"
        className="sr-only focus:not-sr-only focus:fixed focus:top-1 focus:left-72 focus:z-[9999] focus:px-3 focus:py-1.5 focus:rounded focus:bg-daw-accent focus:text-white focus:text-xs focus:font-medium focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to mixer
      </a>
    </nav>
  );
}
