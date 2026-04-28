import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBlob } from '../browserDownload';

describe('downloadBlob', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('creates an anchor element and clicks it', () => {
    const blob = new Blob(['test'], { type: 'audio/wav' });
    downloadBlob(blob, 'test.wav');
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('sets the download filename on the anchor', () => {
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    const blob = new Blob(['data']);
    downloadBlob(blob, 'my-song.wav');
    expect(anchor.download).toBe('my-song.wav');
  });

  it('creates and revokes an object URL', () => {
    const blob = new Blob(['data']);
    downloadBlob(blob, 'output.wav');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the URL even if click throws', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: () => { throw new Error('click failed'); },
    } as unknown as HTMLAnchorElement);

    const blob = new Blob(['data']);
    expect(() => downloadBlob(blob, 'fail.wav')).toThrow('click failed');
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});
