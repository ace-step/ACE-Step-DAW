/**
 * Custom bracket cursors — replace the system default <> resize arrows with [ and ].
 * Used on clip resize handles, loop region handles, and section resize handles.
 */
const makeBracketCursor = (char: '[' | ']') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="20" viewBox="0 0 16 20"><text x="8" y="15" text-anchor="middle" font-family="monospace" font-size="16" font-weight="900" fill="black" stroke="white" stroke-width="1">${char}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 10, col-resize`;
};

export const CURSOR_BRACKET_LEFT = makeBracketCursor('[');
export const CURSOR_BRACKET_RIGHT = makeBracketCursor(']');
