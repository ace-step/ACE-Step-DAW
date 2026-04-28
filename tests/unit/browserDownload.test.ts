import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../src/services/browserDownload';

describe('browserDownload', () => {
  const createObjectURL = vi.fn(() => 'blob:test-url');
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    click.mockClear();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click,
        } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an anchor download and revokes the object URL', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });

    downloadBlob(blob, 'hello.txt');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('sets the correct download filename on the anchor element', () => {
    const blob = new Blob(['data'], { type: 'application/octet-stream' });
    let capturedDownload = '';

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const anchor = {
          href: '',
          download: '',
          click: () => {
            capturedDownload = anchor.download;
          },
        };
        return anchor as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    });

    downloadBlob(blob, 'project-export.zip');

    expect(capturedDownload).toBe('project-export.zip');
  });

  it('revokes the object URL even when click throws', () => {
    const blob = new Blob(['fail'], { type: 'text/plain' });

    click.mockImplementationOnce(() => {
      throw new Error('click blocked by popup blocker');
    });

    expect(() => downloadBlob(blob, 'fail.txt')).toThrow('click blocked by popup blocker');
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
