import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (typeof globalThis.ResizeObserver === 'undefined') {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
}

// Mock canvas getContext to suppress jsdom "Not implemented" warnings.
// Uses vi.spyOn so individual tests can override/restore cleanly.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
  this: HTMLCanvasElement,
  contextId: string,
) {
  if (contextId === '2d') {
    const gradient = { addColorStop: () => {} };
    const knownMethods: Record<string, unknown> = {
      fillRect: () => {},
      clearRect: () => {},
      strokeRect: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray((w ?? 0) * (h ?? 0) * 4),
        width: w ?? 0,
        height: h ?? 0,
      }),
      putImageData: () => {},
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray((w ?? 0) * (h ?? 0) * 4),
        width: w ?? 0,
        height: h ?? 0,
      }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => null,
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      fillText: () => {},
      strokeText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      arcTo: () => {},
      ellipse: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      resetTransform: () => {},
      rect: () => {},
      roundRect: () => {},
      clip: () => {},
      isPointInPath: () => false,
      setLineDash: () => {},
      getLineDash: () => [],
      canvas: this,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeStyle: '#000',
      fillStyle: '#000',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
    };
    // Proxy returns no-op for any method not explicitly listed above
    return new Proxy(knownMethods, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        if (typeof prop === 'string') return () => {};
        return undefined;
      },
    });
  }
  return null;
} as () => null);
