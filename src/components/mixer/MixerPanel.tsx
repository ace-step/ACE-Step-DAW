import React, { useRef, useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../ui/Knob';
import { LevelMeter } from './LevelMeter';
import { MasteringPanel } from './MasteringPanel';
import { AiMixPanel } from './AiMixPanel';
import { useAiMixStore } from '../../store/aiMixStore';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { VerticalFader } from './VerticalFader';
import { SidechainRoutingOverlay } from './SidechainRoutingOverlay';
import { EmptyState } from '../ui/EmptyState';
import type { Track, ReturnTrack, TrackEffectType } from '../../types/project';

const MIXER_MIN_VISIBLE_HEIGHT = 360;
const MIXER_RESIZE_HANDLE_HEIGHT = 6;
const CHANNEL_STRIP_RESERVED_HEIGHT = 380;
const CHANNEL_STRIP_BOTTOM_PADDING = 12;
const FADER_MIN_HEIGHT = 96;

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

/** Small "X" icon used for remove buttons in insert/send slots. */
function SlotRemoveIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="1" x2="7" y2="7" />
      <line x1="7" y1="1" x2="1" y2="7" />
    </svg>
  );
}

function volumeToDb(v: number): string {
  if (v <= 0) return '-inf';
  const db = 20 * Math.log10(v);
  return (db >= 0 ? '+' : '') + db.toFixed(1);
}

interface ChannelStripProps {
  track: Track;
  faderHeight: number;
  returnTracks: ReturnTrack[];
  anySoloed: boolean;
}

const ChannelStrip = React.memo(function ChannelStrip({ track, faderHeight, returnTracks, anySoloed }: ChannelStripProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);
  const addTrackEffect = useProjectStore((s) => s.addTrackEffect);
  const removeTrackEffect = useProjectStore((s) => s.removeTrackEffect);
  const toggleTrackEffectsBypass = useProjectStore((s) => s.toggleTrackEffectsBypass);
  const updateTrackSend = useProjectStore((s) => s.updateTrackSend);
  const setSendPrePost = useProjectStore((s) => s.setSendPrePost);
  const addReturnTrack = useProjectStore((s) => s.addReturnTrack);
  const removeReturnTrack = useProjectStore((s) => s.removeReturnTrack);
  const setGroupMuted = useProjectStore((s) => s.setGroupMuted);
  const setGroupSoloed = useProjectStore((s) => s.setGroupSoloed);
  const setExpandedTrackId = useUIStore((s) => s.setExpandedTrackId);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

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
  const isImpliedMute = anySoloed && !track.soloed;
  const isSelected = useUIStore((s) => s.keyboardContext.scope === 'mixer' && s.keyboardContext.trackId === track.id);

  const handleDoubleClickName = useCallback(() => {
    setRenameValue(track.displayName);
    setIsRenaming(true);
    // Focus will happen via autoFocus on the input
  }, [track.displayName]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== track.displayName) {
      renameTrack(track.id, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, track.displayName, track.id, renameTrack]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsRenaming(false);
    }
  }, [commitRename]);

  return (
    <div
      data-testid="channel-strip"
      data-track-id={track.id}
      data-keyboard-context="mixer"
      role="group"
      aria-label={`Mixer channel ${track.displayName}`}
      aria-selected={isSelected ? 'true' : 'false'}
      tabIndex={0}
      className={`flex h-full min-h-0 min-w-[132px] flex-col overflow-hidden border-r border-[#3a3a3a] px-3 py-0 ${isSelected ? 'ring-1 ring-inset ring-daw-accent' : ''} ${isFrozen ? 'opacity-70' : ''} ${isImpliedMute ? 'daw-implied-mute' : ''} ${track.soloed ? 'daw-soloed' : ''}`}
      style={{
        background: 'linear-gradient(180deg, #2e2e2e 0%, #262626 100%)',
        ...(track.soloed ? { boxShadow: 'inset 0 0 8px rgba(251, 191, 36, 0.15)' } : {}),
        ...(track.muted ? { boxShadow: 'inset 0 0 0 1px rgba(239, 68, 68, 0.15)' } : {}),
      }}
      onFocus={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('mixer', track.id);
      }}
      onMouseDown={() => {
        setExpandedTrackId(track.id);
        setKeyboardContext('mixer', track.id);
      }}
    >
      {/* Track color strip at top */}
      <div className="w-full h-1 rounded-b-sm shrink-0 mb-2" style={{ backgroundColor: track.color }} data-testid="track-color-strip-top" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
        {/* Track header group */}
        <div data-testid="channel-header" className="flex w-full flex-col items-center gap-1.5 pb-2">
          {track.isGroup && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-[#333] rounded px-1.5 py-0.5">GRP</span>
          )}

          {/* Track name — double-click to rename */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              data-testid="channel-rename-input"
              className="w-full bg-[#333] border border-daw-accent rounded px-1 py-0.5 text-xs text-zinc-100 text-center outline-none"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
              autoFocus
              maxLength={32}
            />
          ) : (
            <span
              data-testid="channel-name"
              className="text-xs text-zinc-300 font-medium leading-none truncate w-full text-center uppercase tracking-wide cursor-default"
              title={`${track.displayName} (double-click to rename)`}
              onDoubleClick={handleDoubleClickName}
            >
              {isFrozen && <span className="text-cyan-400 mr-0.5" title="Frozen">*</span>}
              {track.displayName}
            </span>
          )}

          {/* Mute / Solo / FX bypass buttons */}
          <div className="flex gap-1.5 mt-0.5">
            <button
              data-testid="mute-btn"
              onClick={() => track.isGroup ? setGroupMuted(track.id, !track.muted) : updateTrack(track.id, { muted: !track.muted })}
              aria-label={`Mute ${track.displayName}`}
              aria-pressed={track.muted}
              className={`text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-sm transition-all duration-200 ${
                track.muted ? 'bg-red-500 text-white shadow-[0_0_6px_rgba(239,68,68,0.4)]' : 'bg-[#444] text-zinc-500 hover:bg-[#484848]'
              }`}
            >
              M
            </button>
            <button
              data-testid="solo-btn"
              onClick={() => track.isGroup ? setGroupSoloed(track.id, !track.soloed) : updateTrack(track.id, { soloed: !track.soloed })}
              aria-label={`Solo ${track.displayName}`}
              aria-pressed={track.soloed}
              className={`text-[10px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-sm transition-all duration-200 ${
                track.soloed ? 'bg-amber-400 text-black shadow-[0_0_6px_rgba(251,191,36,0.5)]' : 'bg-[#444] text-zinc-500 hover:bg-[#484848]'
              }`}
            >
              S
            </button>
            <button
              onClick={() => toggleTrackEffectsBypass(track.id)}
              aria-label={`FX bypass ${track.displayName}`}
              aria-keyshortcuts="P"
              title={`Bypass all track effects (P)${effectsBypassed ? ' — active' : ''}`}
              className={`flex h-[18px] min-w-[26px] items-center justify-center rounded-sm px-1.5 text-[9px] font-semibold leading-none transition-colors ${
                effectsBypassed ? 'bg-orange-500 text-black' : 'bg-[#444] text-zinc-400 hover:bg-[#484848]'
              }`}
            >
              FX
            </button>
          </div>
        </div>

        {/* Pan control */}
        <div data-testid="pan-section" className="flex w-full flex-col items-center py-1">
          <Knob value={pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateTrackMixer(track.id, { pan: v })} label="Pan" size={36} step={0.01} disabled={isFrozen} />
        </div>

        {/* Section separator */}
        <div className="w-4/5 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, #3a3a3a 30%, #3a3a3a 70%, transparent 100%)' }} />

        {/* Inserts section — dynamic effect slots */}
        <div data-testid="inserts-section" className={`w-full py-1 transition-opacity ${effectsBypassed ? 'opacity-45' : 'opacity-100'}`}>
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">Inserts</div>
          <div className="flex flex-col gap-1">
            {effects.map((effect, i) => {
              const label = EFFECT_SHORT_NAMES[effect.type] ?? effect.type;
              return (
                <div
                  key={effect.id}
                  data-testid={`insert-slot-${i}`}
                  className={`flex items-center gap-0.5 text-[10px] w-full rounded px-1.5 py-1 text-left truncate transition-colors ${
                    effect.enabled
                      ? 'bg-[#3a3a3a] text-zinc-300 hover:bg-[#444]'
                      : 'bg-[#3a3a3a] text-zinc-300 hover:bg-[#444] opacity-50'
                  }`}
                  title={`${label}${effect.enabled ? '' : ' (bypassed)'}`}
                >
                  <span className="flex-1 truncate">{label}</span>
                  <button
                    data-testid={`remove-insert-btn-${i}`}
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    aria-label={`Remove ${label} insert`}
                    title="Remove insert"
                    onClick={() => removeTrackEffect(track.id, effect.id)}
                    disabled={isFrozen}
                  >
                    <SlotRemoveIcon />
                  </button>
                </div>
              );
            })}
            <button
              data-testid="add-insert-btn"
              className="text-[10px] w-full rounded px-1.5 py-1 text-center transition-colors bg-[#333] text-zinc-600 hover:bg-[#3a3a3a]"
              title="Add insert effect"
              onClick={() => addTrackEffect(track.id, 'reverb' as TrackEffectType)}
              disabled={isFrozen}
            >
              +
            </button>
          </div>
        </div>

        {/* Section separator */}
        <div className="w-4/5 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, #3a3a3a 30%, #3a3a3a 70%, transparent 100%)' }} />

        {/* Sends section — dynamic send slots */}
        <div data-testid="sends-section" className="w-full py-1">
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1">Sends</div>
          <div className="flex flex-col gap-1">
            {returnTracks.map((rt, i) => {
              const send = sends.find((s) => s.returnTrackId === rt.id);
              const amount = send?.amount ?? 0;
              const isPre = (send?.prePost ?? 'post') === 'pre';
              return (
                <div
                  key={rt.id}
                  data-testid={`send-slot-${i}`}
                  className="flex items-center gap-1"
                >
                  {rt ? (
                    <>
                      <span className="text-[10px] text-zinc-400 truncate flex-1" title={rt.name}>{rt.name}</span>
                      <button
                        type="button"
                        data-testid={`send-prepost-${i}`}
                        className={`h-4 rounded px-1 text-[8px] font-bold uppercase leading-none transition-colors ${
                          isPre
                            ? 'bg-amber-600 text-white'
                            : 'bg-[#333] text-zinc-500 hover:bg-[#3a3a3a]'
                        }`}
                        aria-label={`Toggle pre/post fader for send to ${rt.name}`}
                        disabled={isFrozen}
                        onClick={() => {
                          if (!send) updateTrackSend(track.id, rt.id, amount || 0.5);
                          const idx = sends.findIndex((s) => s.returnTrackId === rt.id);
                          if (idx >= 0) setSendPrePost(track.id, idx, isPre ? 'post' : 'pre');
                        }}
                      >
                        {isPre ? 'PRE' : 'POST'}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={amount}
                        onChange={(e) => updateTrackSend(track.id, rt.id, parseFloat(e.target.value))}
                        aria-label={`Send ${track.displayName} to ${rt.name}`}
                        className="w-10 h-3 accent-blue-500"
                        disabled={isFrozen}
                      />
                      <button
                        data-testid={`remove-send-btn-${i}`}
                        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        aria-label={`Remove send to ${rt.name}`}
                        title="Remove send"
                        onClick={() => removeReturnTrack(rt.id)}
                      >
                        <SlotRemoveIcon />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-zinc-600 w-full text-center">&mdash;</span>
                  )}
                </div>
              );
            })}
            <button
              data-testid="add-send-btn"
              className="text-[10px] w-full rounded px-1.5 py-1 text-center transition-colors bg-[#333] text-zinc-600 hover:bg-[#3a3a3a]"
              title="Add send bus"
              onClick={() => {
                const idx = returnTracks.length + 1;
                addReturnTrack(`FX ${idx}`);
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Section separator */}
        <div className="w-4/5 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, #3a3a3a 30%, #3a3a3a 70%, transparent 100%)' }} />

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
        <div className="w-4/5 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, #3a3a3a 30%, #3a3a3a 70%, transparent 100%)' }} />

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

      {/* Fader + meter region */}
      <div data-testid="fader-region" className="mt-2 flex shrink-0 min-h-[96px] flex-col items-center justify-end gap-1.5 self-stretch border-t border-[#3a3a3a] pt-2 pb-1" style={{ height: faderHeight + 24 }}>
        <div className="relative" style={{ height: faderHeight }}>
          <LevelMeter trackId={track.id} stereo showScale />
          <VerticalFader
            value={vol}
            min={0}
            max={1}
            defaultValue={0.8}
            onChange={(v) => updateTrack(track.id, { volume: v })}
            aria-label={`${track.displayName} volume fader`}
            accentColor={track.color}
          />
        </div>
        <span className="text-xs font-mono text-zinc-400">{volumeToDb(vol)}</span>
      </div>
    </div>
  );
});

interface MasterStripProps {
  faderHeight: number;
}

interface ReturnTrackStripProps {
  returnTrack: ReturnTrack;
  faderHeight: number;
}

function ReturnTrackStrip({ returnTrack, faderHeight }: ReturnTrackStripProps) {
  const updateReturnTrack = useProjectStore((s) => s.updateReturnTrack);

  return (
    <div
      data-testid={`return-strip-${returnTrack.id}`}
      className="flex h-full min-h-0 w-[72px] shrink-0 flex-col items-center border-l border-[#333] px-1 py-2 gap-1"
      style={{ background: 'linear-gradient(180deg, #2c2c2c 0%, #242424 100%)' }}
    >
      {/* Return track label */}
      <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider truncate w-full text-center" title={returnTrack.name}>
        {returnTrack.name}
      </span>

      {/* Pan knob */}
      <Knob
        value={returnTrack.pan}
        min={-1}
        max={1}
        defaultValue={0}
        onChange={(v) => updateReturnTrack(returnTrack.id, { pan: v })}
        label="Pan"
        size={28}
        step={0.01}
      />

      {/* Effects indicator */}
      <div className="text-[8px] text-zinc-500">
        {returnTrack.effects.length > 0
          ? <span className="text-teal-400">{returnTrack.effects.length} FX</span>
          : <span>No FX</span>
        }
      </div>

      {/* Volume fader + meter */}
      <div className="flex-1 flex flex-col items-center justify-end min-h-0 gap-1" style={{ height: faderHeight }}>
        <div className="relative flex justify-center gap-1" style={{ height: faderHeight - 24 }}>
          <LevelMeter returnTrackId={returnTrack.id} />
          <VerticalFader
            value={returnTrack.volume}
            min={0}
            max={1}
            defaultValue={1}
            onChange={(v) => updateReturnTrack(returnTrack.id, { volume: v })}
            aria-label={`${returnTrack.name} volume fader`}
            accentColor="#2dd4bf"
            width={12}
          />
        </div>
        <span className="text-[10px] font-mono text-zinc-400">{volumeToDb(returnTrack.volume)}</span>
      </div>
    </div>
  );
}

function MasterStrip({ faderHeight }: MasterStripProps) {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showSpectrum = useUIStore((s) => s.showSpectrumAnalyzer);
  const toggleSpectrum = useUIStore((s) => s.toggleSpectrumAnalyzer);
  const aiMixPanelOpen = useAiMixStore((s) => s.panelOpen);
  const openAiMixPanel = useAiMixStore((s) => s.openPanel);
  const closeAiMixPanel = useAiMixStore((s) => s.closePanel);
  if (!project) return null;
  const masterVol = project.masterVolume ?? 1.0;
  const handleChange = (v: number) => { updateProject({ masterVolume: v }); getAudioEngine().masterVolume = v; };

  return (
    <div
      data-testid="master-strip"
      className="flex h-full min-h-0 min-w-[250px] flex-col overflow-hidden border-l-2 border-[#555] px-4 py-2"
      style={{ background: 'linear-gradient(180deg, #2a2a2a 0%, #202020 100%)' }}
    >
      <div className="flex w-full shrink-0 items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Master</span>
        <button
          onClick={() => aiMixPanelOpen ? closeAiMixPanel() : openAiMixPanel()}
          className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            aiMixPanelOpen ? 'bg-violet-600 text-white' : 'bg-[#444] text-zinc-400 hover:bg-[#555]'
          }`}
          title="Toggle AI Mix panel"
          data-testid="ai-mix-toggle"
        >
          AI MIX
        </button>
        <button
          onClick={toggleSpectrum}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
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
        {aiMixPanelOpen && <AiMixPanel />}
        <MasteringPanel />
      </div>
      <div data-testid="master-fader-region" className="mt-1 flex shrink-0 min-h-[96px] flex-col items-center justify-end gap-1 self-stretch pb-1" style={{ height: faderHeight + 24 }}>
        <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase tracking-widest mb-1">
          <span>IN</span>
          <span className="mx-2">OUT</span>
        </div>
        <div className="relative flex gap-2" style={{ height: faderHeight }}>
          <LevelMeter masterStage="input" stereo={false} />
          <div className="relative">
            <LevelMeter masterStage="output" stereo={false} showScale />
            <VerticalFader
              value={masterVol}
              min={0}
              max={1.5}
              defaultValue={1.0}
              onChange={handleChange}
              aria-label="Master volume fader"
              accentColor="#4A5FFF"
            />
          </div>
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
  const channelStripContainerRef = useRef<HTMLDivElement>(null);

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
  const anySoloed = project.tracks.some((t) => t.soloed);
  const visibleMixerHeight = Math.max(mixerHeight, MIXER_MIN_VISIBLE_HEIGHT);
  const focusedTrackName = project.tracks.find((track) => track.id === keyboardContext.trackId)?.displayName ?? 'None';
  const faderHeight = Math.max(
    FADER_MIN_HEIGHT,
    visibleMixerHeight - MIXER_RESIZE_HANDLE_HEIGHT - CHANNEL_STRIP_RESERVED_HEIGHT - CHANNEL_STRIP_BOTTOM_PADDING,
  );

  return (
    <div
      data-testid="mixer-panel"
      className="border-t border-[#1a1a1a] flex flex-col select-none shrink-0 transition-[height,opacity] duration-150 ease-out overflow-hidden daw-shadow-md"
      style={{ height: showMixer ? visibleMixerHeight : 0, opacity: showMixer ? 1 : 0, background: showMixer ? 'linear-gradient(180deg, #2a2a2a 0%, #222 100%)' : undefined }}
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
        className="flex items-center px-3 py-1 text-[10px] text-zinc-300 border-b border-[#333] bg-[#252525]"
      >
        <span className="flex-1">Scope: <span className="text-zinc-100">Mixer</span> · Channel: <span className="text-zinc-100">{focusedTrackName}</span></span>
        <button
          onClick={() => useUIStore.getState().setShowMixer(false)}
          aria-label="Close mixer"
          title="Close mixer (M)"
          className="ml-2 flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-[#444] hover:text-zinc-200 transition-colors"
          data-testid="mixer-close-btn"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-3 relative">
        <SidechainRoutingOverlay containerRef={channelStripContainerRef} />
        <div ref={channelStripContainerRef} className="flex items-stretch h-full">
          {project.tracks.length === 0 && (
            <div className="flex-1">
              <EmptyState
                icon={
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="3" height="20" rx="1" />
                    <rect x="10.5" y="6" width="3" height="16" rx="1" />
                    <rect x="17" y="4" width="3" height="18" rx="1" />
                  </svg>
                }
                title="No mixer channels"
                description="Add tracks to your project to see mixer channels here"
                compact
              />
            </div>
          )}
          {[...project.tracks].filter((t) => t.trackType !== 'video').sort((a, b) => a.order - b.order).map((track) => (
            <ChannelStrip key={track.id} track={track} faderHeight={faderHeight} returnTracks={returnTracks} anySoloed={anySoloed} />
          ))}
          {returnTracks.length > 0 && (
            <>
              <div className="w-px self-stretch bg-teal-700/40" />
              {returnTracks.map((rt) => (
                <ReturnTrackStrip key={rt.id} returnTrack={rt} faderHeight={faderHeight} />
              ))}
            </>
          )}
          <MasterStrip faderHeight={faderHeight} />
        </div>
      </div>
    </div>
  );
}
