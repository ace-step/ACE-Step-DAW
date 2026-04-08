import { describe, it, expect } from 'vitest';
import {
  encodeId3v2Tag,
  buildFlacVorbisComment,
  type ExportMetadata,
} from '../audioEncoders';

describe('ID3v2 metadata encoding', () => {
  it('encodes BPM as TBPM frame', () => {
    const metadata: ExportMetadata = { bpm: 128 };
    const tag = encodeId3v2Tag(metadata);
    // Tag should contain 'TBPM' frame with value '128'
    const tagStr = new TextDecoder().decode(tag);
    expect(tagStr).toContain('TBPM');
    expect(tagStr).toContain('128');
  });

  it('encodes musical key as TKEY frame', () => {
    const metadata: ExportMetadata = { key: 'C major' };
    const tag = encodeId3v2Tag(metadata);
    const tagStr = new TextDecoder().decode(tag);
    expect(tagStr).toContain('TKEY');
    expect(tagStr).toContain('C major');
  });

  it('includes BPM and key alongside other metadata', () => {
    const metadata: ExportMetadata = {
      title: 'Test Song',
      artist: 'Test Artist',
      bpm: 140,
      key: 'A minor',
    };
    const tag = encodeId3v2Tag(metadata);
    const tagStr = new TextDecoder().decode(tag);
    expect(tagStr).toContain('TIT2');
    expect(tagStr).toContain('TPE1');
    expect(tagStr).toContain('TBPM');
    expect(tagStr).toContain('TKEY');
  });

  it('omits BPM/key frames when not provided', () => {
    const metadata: ExportMetadata = { title: 'No BPM' };
    const tag = encodeId3v2Tag(metadata);
    const tagStr = new TextDecoder().decode(tag);
    expect(tagStr).toContain('TIT2');
    expect(tagStr).not.toContain('TBPM');
    expect(tagStr).not.toContain('TKEY');
  });
});

describe('FLAC Vorbis comment metadata', () => {
  it('encodes BPM as BPM= comment', () => {
    const metadata: ExportMetadata = { bpm: 128 };
    const comment = buildFlacVorbisComment(metadata);
    const commentStr = new TextDecoder().decode(comment);
    expect(commentStr).toContain('BPM=128');
  });

  it('encodes musical key as KEY= comment', () => {
    const metadata: ExportMetadata = { key: 'D minor' };
    const comment = buildFlacVorbisComment(metadata);
    const commentStr = new TextDecoder().decode(comment);
    expect(commentStr).toContain('KEY=D minor');
  });

  it('includes BPM and key alongside other comments', () => {
    const metadata: ExportMetadata = {
      title: 'Song',
      artist: 'Artist',
      bpm: 95,
      key: 'G major',
    };
    const comment = buildFlacVorbisComment(metadata);
    const commentStr = new TextDecoder().decode(comment);
    expect(commentStr).toContain('TITLE=Song');
    expect(commentStr).toContain('ARTIST=Artist');
    expect(commentStr).toContain('BPM=95');
    expect(commentStr).toContain('KEY=G major');
  });
});
