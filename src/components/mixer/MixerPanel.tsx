import { useRef, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import { LevelMeter } from './LevelMeter';
import { MasteringPanel } from './MasteringPanel';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import type { Track, ReturnTrack, TrackEffectType } from '../../types/project';

const MIXER_MIN_VISIBLE_HEIGHT = 360;
const MIXER_RESIZE_HANDLE_HEIGHT = 6;
const CHANNEL_STRIP_RESERVED_HEIGHT = 380;
const CHANNEL_STRIP_BOTTOM_PADDING = 12;
const FADER_MIN_HEIGHT = 96;
const MAX_INSERT_SLOTS = 4;
const MAX_SEND_SLOTS = 2;

const EFFECT_SHORT_NAMES: Record<string, string> = {
  eq3: 'EQ3',
  parametricEq: 'PEQ',
  compressor: 'Comp',
  reverb: 'Reverb',
  delay: 'Delay',
  distortion: 'Dist',
  filter: 'Filter',
  chorus: 'Chorus',
  flanger: 'Flanger',
  phaser: 'Phaser',
};

function volumeToDb(v: number): string {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

interface ChannelStripProps {
  track: Track;
  faderHeight: number;
  returnTracks: ReturnTrack[];
}

function ChannelStrip({ track, faderHeight, returnTracks }: ChannelStripProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const toggleTrackEffectsBypass = useProjectStore((s) => s.toggleTrackEffectsBypass);
  const updateTrackSend = useProjectStore((s) => s.updateTrackSend);
  const setGroupMuted = useProjectStore((s) => s.setGroupMuted);
  const setGroupSoloed = useProjectStore((s) => s.setGroupSoloed);
  const setExpandedTrackId = useUIStore((s) => s.setExpandedTrackId);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);

  const vol = track.volume;
  const pan = track.pan ?? 0;
  const eqLow = track.eqLowGain ?? 0;
  const eqMid = track.eqMidGain ?? 0;
  const eqHigh = track.eqHighGain ?? 0;
  const compEnabled = track.compressorEnabled ?? false;
  const compThresh = track.compressorThreshold ?? -24;
  const compRatio = track.compressorRatio ?? 4;
  const isFrozen = track.frozen ?? false;
  const effects = track.effects ?? [];
  const effectsBypassed = track.effectsBypassed ?? false;
  const sends = track.sends ?? [];
  const isSelected = useUIStore((s) => s.keyboardContext.scope === 'mixer' && s.keyboardContext.trackId === track.id);

  return (
    <div
      data-testid="channel-strip"
      data-track-id={track.id}
      data-keyboard-context="mixer"
      role="group"
      aria-label={`Mixer channel ${track.displayName}`}
      aria-selected={isSelected ? 'true' : 'false'}
      tabIndex={0}
      className={`flex h-full min-h-0 min-w-[132px] flex-col overflow-hidden border-r border-[#3a3a3a] bg-[#2a2a2a] px-3 py-2 ${isSelected ? 'ring-1 ring-inset ring-daw-accent' : ''} ${isFrozen ? 'opacity-70' : ''}`}
      onFocus={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('mixer', track.id);
      }}
      onMouseDown={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('mixer', track.id);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
        {/* Track header group */}
        <div data-testid="channel-header" className="flex w-full flex-col items-center gap-1.5 pb-2">
          <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: track.color }} />
          {track.isGroup && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-[#333] rounded px-1.5 py-0.5">GRP</span>
          )}
          <span className="text-xs text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide" title={track.displayName}>
            {isFrozen && <span className="text-cyan-400 mr-0.5" title="Frozen">*</span>}
            {track.displayName}
          </span>

          <div className="flex gap-2 mt-0.5">
            <button
              onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
              aria-label={`Mute ${track.displayName}`}
              className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
                track.muted ? 'bg-amber-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
              }`}
            >
              M
            </button>
            <button
              onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
              aria-label={`Solo ${track.displayName}`}
              className={`text-xs font-bold px-2.5 py-1 rounded transition-colors ${
                track.soloed ? 'bg-emerald-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
              }`}
            >
              S
            </button>
            {!track.isGroup && (
              <button
                onClick={() => toggleTrackEffectsBypass(track.id)}
                aria-label={`FX bypass ${track.displayName}`}
                aria-keyshortcuts="P"
                title={`Bypass all track effects (P)${effectsBypassed ? ' — active' : ''}`}
                className={`text-xs font-bold px-2 py-1 rounded transition-colors ${
                  effectsBypassed ? 'bg-orange-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
                }`}
              >
                FX
              </button>
            )}
          </div>
        </div>

        {/* Pan control */}
        <div data-testid="pan-section" className="flex w-full flex-col items-center py-1">
          <Knob value={pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { pan: v })} label="Pan" size={36} step={0.01} disabled={isFrozen} />
        </div>

        {/* Section separator */}
        <div className="w-4/5 border-t border-[#3a3a3a]" />

        {/* Inserts section — 4 effect slots */}
        <div data-testid="inserts-section" className={`w-full py-1 transition-opacity ${effectsBypassed ? 'opacity-45' : 'opacity-100'}`}>
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">Inserts</div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: MAX_INSERT_SLOTS }).map((_, i) => {
              const effect = effects[i];
              return (
                <button
                  key={i}
                  data-testid={`insert-slot-${i}`}
                  className={`text-[10px] w-full rounded px-1.5 py-1 text-left truncate transition-colors ${
                    effect
                      ? effect.enabled
                        ? 'bg-[#3a3a3a] text-zinc-300 hover:bg-[#444]'
                        : 'bg-[#3a3a3a] text-zinc-300 hover:bg-[#444] opacity-50'
                      : 'bg-[#333] text-zinc-600 hover:bg-[#3a3a3a]'
                  }`}
                  title={effect ? `${EFFECT_SHORT_NAMES[effect.type] ?? effect.type}${effect.enabled ? '' : ' (bypassed)'}` : 'Add insert effect'}
                  onClick={() => {
                    if (!effect && !isFrozen) {
                      addTrackEffect(track.id, 'reverb' as TrackEffectType);
                    }
                  }}
                  disabled={isFrozen}
                >
                  {effect ? (EFFECT_SHORT_NAMES[effect.type] ?? effect.type) : '+'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section separator */}
        <div className="w-4/5 border-t border-[#3a3a3a]" />

        {/* Sends section — 2 send slots */}
        <div data-testid="sends-section" className="w-full py-1">
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">Sends</div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: MAX_SEND_SLOTS }).map((_, i) => {
              const rt = returnTracks[i];
              const send = rt ? sends.find((s) => s.returnTrackId === rt.id) : undefined;
              const amount = send?.amount ?? 0;
              return (
                <div
                  key={i}
                  data-testid={`send-slot-${i}`}
                  className="flex items-center gap-1.5"
                >
                  {rt ? (
                    <>
                      <span className="text-[10px] text-zinc-400 truncate flex-1" title={rt.name}>{rt.name}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={amount}
                        onChange={(e) => updateTrackSend(track.id, rt.id, parseFloat(e.target.value))}
                        aria-label={`Send ${track.displayName} to ${rt.name}`}
                        className="w-14 h-3 accent-blue-500"
                        disabled={isFrozen}
                      />
                    </>
                  ) : (
                    <span className="text-[10px] text-zinc-600 w-full text-center">&mdash;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section separator */}
        <div className="w-4/5 border-t border-[#3a3a3a]" />

        {/* EQ section */}
        <div data-testid="eq-section" className="flex w-full flex-col items-center gap-1.5 py-1">
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest">EQ</div>
          <div className="flex gap-2">
            <Knob value={eqLow} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqLowGain: v })} label="Lo" unit="dB" size={34} step={0.5} disabled={isFrozen} />
            <Knob value={eqMid} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqMidGain: v })} label="Mid" unit="dB" size={34} step={0.5} disabled={isFrozen} />
            <Knob value={eqHigh} min={-15} max={15} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { eqHighGain: v })} label="Hi" unit="dB" size={34} step={0.5} disabled={isFrozen} />
          </div>
        </div>

        {/* Section separator */}
        <div className="w-4/5 border-t border-[#3a3a3a]" />

        {/* Compressor section */}
        <div data-testid="comp-section" className="flex w-full flex-col items-center gap-1.5 py-1">
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest">Comp</div>
          <button
            onClick={() => updateTrackMixer(track.id, { compressorEnabled: !compEnabled })}
            className={`text-xs font-semibold px-2 py-1 rounded w-full transition-colors ${
              compEnabled ? 'bg-daw-accent text-white' : 'bg-[#444] text-zinc-400 hover:bg-[#555]'
            }`}
          >
            {compEnabled ? 'ON' : 'OFF'}
          </button>
          <div className="flex gap-2">
            <Knob value={compThresh} min={-60} max={0} defaultValue={-24} onChange={(v) => updateTrackMixer(track.id, { compressorThreshold: v })} label="Thr" unit="dB" size={34} step={1} disabled={!compEnabled || isFrozen} />
            <Knob value={compRatio} min={1} max={20} defaultValue={4} onChange={(v) => updateTrackMixer(track.id, { compressorRatio: v })} label="Rat" size={34} step={0.5} disabled={!compEnabled || isFrozen} />
          </div>
        </div>
      </div>

      <div data-testid="fader-region" className="mt-2 flex shrink-0 min-h-[96px] flex-col items-center justify-end gap-1.5 self-stretch border-t border-[#3a3a3a] pt-2 pb-1" style={{ height: faderHeight + 24 }}>
        <div className="relative flex items-stretch justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter trackId={track.id} />
          <input
            type="range" min={0} max={1} step={0.01} value={vol}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            aria-label={`${track.displayName} volume fader`}
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 28, height: '100%', minHeight: FADER_MIN_HEIGHT, accentColor: track.color }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>
    </div>
  );
}

interface MasterStripProps {
  faderHeight: number;
}

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showSpectrum = useUIStore((s) => s.showSpectrumAnalyzer);
  const toggleSpectrum = useUIStore((s) => s.toggleSpectrumAnalyzer);
  if (!project) return null;
  const masterVol = project.masterVolume ?? 1.0;
  const handleChange = (v: number) => { updateProject({ masterVolume: v }); getAudioEngine().masterVolume = v; };

  return (
    <div className="flex h-full min-h-0 min-w-[250px] flex-col overflow-hidden border-l-2 border-[#555] bg-[#252525] px-4 py-2">
      <div className="flex w-full shrink-0 items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Master</span>
        <button
          onClick={toggleSpectrum}
          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            showSpectrum ? 'bg-blue-600 text-white' : 'bg-[#444] text-zinc-400 hover:bg-[#555]'
          }`}
          title="Toggle spectrum analyzer & LUFS meter"
          data-testid="spectrum-toggle"
        >
          SPEC
        </button>
      </div>
      <div data-testid="master-controls-region" className="mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showSpectrum && <SpectrumAnalyzer width={220} height={120} />}
        <MasteringPanel />
      </div>
      <div data-testid="master-fader-region" className="mt-1 flex shrink-0 min-h-[96px] flex-col items-center justify-end gap-1 self-stretch pb-1" style={{ height: faderHeight + 24 }}>
        <div className="relative flex justify-center gap-2" style={{ height: faderHeight }}>
          <LevelMeter masterStage="input" />
          <LevelMeter masterStage="output" />
          <input
            type="range" min={0} max={1.5} step={0.01} value={masterVol}
            onChange={(e) => handleChange(parseFloat(e.target.value))}
            aria-label="Master volume fader"
            className="appearance-none bg-transparent cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 32, height: '100%', minHeight: FADER_MIN_HEIGHT, accentColor: '#4a90d9' }}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(masterVol)}</span>
      </div>
    </div>
  );
}

export function MixerPanel() {
  const showMixer = useUIStore((s) => s.showMixer);
  const mixerHeight = useUIStore((s) => s.mixerHeight);
  const setMixerHeight = useUIStore((s) => s.setMixerHeight);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const keyboardContext = useUIStore((s) => s.keyboardContext);
  const project = useProjectStore((s) => s.project);

  const dragState = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startH: mixerHeight };
      const onMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY;
        setMixerHeight(dragState.current.startH + delta);
      };
      const onMouseUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [mixerHeight, setMixerHeight],
  );

  if (!project) return null;

  const returnTracks = project.returnTracks ?? [];
  const visibleMixerHeight = Math.max(mixerHeight, MIXER_MIN_VISIBLE_HEIGHT);
  const focusedTrackName = project.tracks.find((track) => track.id === keyboardContext.trackId)?.displayName ?? 'None';
  const faderHeight = Math.max(
    FADER_MIN_HEIGHT,
    visibleMixerHeight - MIXER_RESIZE_HANDLE_HEIGHT - CHANNEL_STRIP_RESERVED_HEIGHT - CHANNEL_STRIP_BOTTOM_PADDING,
  );

  return (
    <div
      data-testid="mixer-panel"
      className="border-t border-[#1a1a1a] bg-[#2a2a2a] flex flex-col select-none shrink-0 transition-[height,opacity] duration-150 ease-out overflow-hidden"
      style={{ height: showMixer ? visibleMixerHeight : 0, opacity: showMixer ? 1 : 0 }}
      onMouseDownCapture={() => setHistoryFocusScope('mixer')}
      onFocusCapture={() => {
        setHistoryFocusScope('mixer');
        setKeyboardContext('mixer');
      }}
      data-keyboard-context="mixer"
      onMouseDown={() => setKeyboardContext('mixer')}
    >
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-daw-accent transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize mixer"
      />
      <div
        aria-label="Mixer navigation status"
        role="status"
        aria-live="polite"
        className="px-3 py-1 text-[10px] text-zinc-300 border-b border-[#333] bg-[#252525]"
      >
        Scope: <span className="text-zinc-100">Mixer</span> · Channel: <span className="text-zinc-100">{focusedTrackName}</span>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-3">
        <div className="flex items-stretch h-full">
          {project.tracks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-600">
              Add tracks to see mixer channels
            </div>
          )}
          {[...project.tracks].sort((a, b) => a.order - b.order).map((track) => (
            <ChannelStrip key={track.id} track={track} faderHeight={faderHeight} returnTracks={returnTracks} />
          ))}
          <MasterStrip faderHeight={faderHeight} />
        </div>
      </div>
    </div>
  );
}
