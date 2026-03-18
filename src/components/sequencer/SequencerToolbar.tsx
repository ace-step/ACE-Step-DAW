import { MiniKnob } from './MiniKnob';
import { FL, ROW_SIZES } from './SequencerConstants';

interface SequencerToolbarProps {
  trackName: string;
  stepsPerBar: number;
  bars: number;
  swing: number;
  rowSize: keyof typeof ROW_SIZES;
  isPreviewPlaying: boolean;
  isBouncing: boolean;
  onSetStepsPerBar: (value: number) => void;
  onSetBars: (value: number) => void;
  onSetSwing: (value: number) => void;
  onSetRowSize: (value: keyof typeof ROW_SIZES) => void;
  onTogglePreview: () => void;
  onBounce: () => void;
  onClose: () => void;
}

export function SequencerToolbar({
  trackName,
  stepsPerBar,
  bars,
  swing,
  rowSize,
  isPreviewPlaying,
  isBouncing,
  onSetStepsPerBar,
  onSetBars,
  onSetSwing,
  onSetRowSize,
  onTogglePreview,
  onBounce,
  onClose,
}: SequencerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 shrink-0" style={{ height: 32, background: FL.headerBg, borderBottom: `1px solid ${FL.border}` }}>
      <div className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill={FL.accent} />
          <rect x="8" y="1" width="5" height="5" rx="1" fill={FL.accent} opacity="0.5" />
          <rect x="1" y="8" width="5" height="5" rx="1" fill={FL.accent} opacity="0.5" />
          <rect x="8" y="8" width="5" height="5" rx="1" fill={FL.accent} opacity="0.3" />
        </svg>
        <span style={{ color: FL.accentBright, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>CHANNEL RACK</span>
      </div>

      <span style={{ color: FL.textDim, fontSize: 10 }}>{trackName}</span>

      <div className="flex items-center gap-1 ml-3" style={{ fontSize: 10 }}>
        <span style={{ color: FL.textDim }}>Steps:</span>
        <div className="flex" style={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${FL.borderLight}` }}>
          {[8, 16, 32].map((value) => (
            <button
              key={value}
              onClick={() => onSetStepsPerBar(value)}
              style={{
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: stepsPerBar === value ? 700 : 400,
                color: stepsPerBar === value ? FL.textBright : FL.textDim,
                background: stepsPerBar === value ? FL.accent : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1" style={{ fontSize: 10 }}>
        <span style={{ color: FL.textDim }}>Bars:</span>
        <button
          onClick={() => { if (bars > 1) onSetBars(bars - 1); }}
          disabled={bars <= 1}
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: FL.stepOff,
            border: `1px solid ${FL.borderLight}`,
            borderRadius: 2,
            color: bars <= 1 ? FL.border : FL.text,
            cursor: bars <= 1 ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          -
        </button>
        <span style={{ color: FL.textBright, width: 18, textAlign: 'center', fontWeight: 600 }}>{bars}</span>
        <button
          onClick={() => onSetBars(bars + 1)}
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: FL.stepOff,
            border: `1px solid ${FL.borderLight}`,
            borderRadius: 2,
            color: FL.text,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      <MiniKnob value={swing} min={0} max={1} size={20} color={FL.accentBright} label="Swing" onChange={onSetSwing} />

      <div className="flex items-center gap-0.5 ml-2" style={{ fontSize: 9 }}>
        {(Object.keys(ROW_SIZES) as Array<keyof typeof ROW_SIZES>).map((size) => (
          <button
            key={size}
            onClick={() => onSetRowSize(size)}
            title={size}
            style={{
              width: size === 'compact' ? 12 : size === 'normal' ? 14 : 16,
              height: size === 'compact' ? 8 : size === 'normal' ? 10 : 12,
              borderRadius: 2,
              border: `1px solid ${rowSize === size ? FL.accentBright : FL.borderLight}`,
              background: rowSize === size ? `${FL.accent}60` : 'transparent',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onTogglePreview}
        style={{
          padding: '2px 10px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          background: isPreviewPlaying ? '#c0392b' : FL.accent,
          color: '#fff',
        }}
        title="Space to toggle"
      >
        {isPreviewPlaying ? '■ Stop' : '▶ Play'}
      </button>
      <button
        onClick={onBounce}
        disabled={isBouncing}
        style={{
          padding: '2px 10px',
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          background: '#2980b9',
          color: '#fff',
          opacity: isBouncing ? 0.5 : 1,
        }}
      >
        {isBouncing ? 'Bouncing...' : 'Bounce'}
      </button>
      <button
        onClick={onClose}
        style={{
          padding: '2px 8px',
          borderRadius: 3,
          fontSize: 10,
          border: `1px solid ${FL.borderLight}`,
          background: 'transparent',
          color: FL.textDim,
          cursor: 'pointer',
        }}
        title="Esc"
      >
        ✕
      </button>
    </div>
  );
}
