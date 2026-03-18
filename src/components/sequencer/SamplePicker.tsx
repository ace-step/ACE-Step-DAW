import { useRef } from 'react';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { ALL_DRUM_SAMPLES } from '../../constants/tracks';
import { cacheUserSample } from '../../services/sampleManager';
import { FL } from './SequencerConstants';

export interface SamplePickerDropdownProps {
  currentKey: string;
  onSelect: (key: string, name: string) => void;
  onClose: () => void;
  onPreview: (key: string) => void;
}

export function SamplePickerDropdown({
  currentKey,
  onSelect,
  onClose,
  onPreview,
}: SamplePickerDropdownProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) return;
    const engine = getAudioEngine();
    await engine.resume();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const key = `user-sample-${Date.now()}-${file.name}`;
    cacheUserSample(key, audioBuffer);
    const displayName = file.name.replace(/\.[^.]+$/, '');
    onSelect(key, displayName);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-0 z-50 mt-1 py-1"
        style={{
          background: FL.headerBg,
          border: `1px solid ${FL.borderLight}`,
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          width: 180,
        }}
      >
        <div
          style={{
            padding: '4px 8px',
            fontSize: 9,
            color: FL.textDim,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Built-in Samples
        </div>
        {ALL_DRUM_SAMPLES.map((kit) => (
          <button
            key={kit.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '4px 8px',
              fontSize: 11,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              textAlign: 'left',
              color: currentKey === kit.id ? FL.accentBright : FL.text,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = FL.stepOff; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => onSelect(kit.id, kit.name)}
            onMouseDown={() => onPreview(kit.id)}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: kit.color }} />
            <span style={{ flex: 1 }}>{kit.name}</span>
            {currentKey === kit.id && <span style={{ color: FL.accentBright }}>✓</span>}
          </button>
        ))}
        <div style={{ margin: '2px 8px', height: 1, background: FL.border }} />
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '4px 8px',
            fontSize: 11,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            textAlign: 'left',
            color: '#f39c12',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = FL.stepOff; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span style={{ fontSize: 12 }}>📂</span>
          <span>Import Audio...</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </>
  );
}
