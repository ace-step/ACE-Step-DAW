import { useState, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { TRACK_NAMES, TRACK_CATALOG, TRACK_TYPE_CATALOG } from '../../constants/tracks';
import type { TrackName, TrackType } from '../../types/project';
import { useAudioImport } from '../../hooks/useAudioImport';

type PickerStep = 'type' | 'instrument';

export function InstrumentPicker() {
  const show = useUIStore((s) => s.showInstrumentPicker);
  const setShow = useUIStore((s) => s.setShowInstrumentPicker);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setTrackSampler = useProjectStore((s) => s.setTrackSampler);
  const createQuickSamplerTrack = useProjectStore((s) => s.createQuickSamplerTrack);
  const applyTrackPreset = useProjectStore((s) => s.applyTrackPreset);
  const project = useProjectStore((s) => s.project);
  const { openFilePicker, openQuickSamplerFilePicker } = useAudioImport();

  const [step, setStep] = useState<PickerStep>('type');
  const [selectedType, setSelectedType] = useState<TrackType>('stems');

  const close = useCallback(() => {
    setShow(false);
    setStep('type');
    setSelectedType('stems');
  }, [setShow]);

  if (!show || !project) return null;

  const trackCountByName: Partial<Record<TrackName, number>> = {};
  for (const t of project.tracks) {
    trackCountByName[t.trackName] = (trackCountByName[t.trackName] ?? 0) + 1;
  }

  const handleTypeSelect = (type: TrackType) => {
    setSelectedType(type);
    setStep('instrument');
  };

  const handleInstrumentSelect = (name: TrackName) => {
    addTrack(name, selectedType);
    close();
  };

  const handlePresetSelect = (presetId: string) => {
    applyTrackPreset(presetId);
    close();
  };

  const typeOrder: TrackType[] = ['stems', 'sample', 'sequencer', 'drumMachine', 'pianoRoll'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            {step === 'instrument' && (
              <button
                onClick={() => setStep('type')}
                className="text-zinc-400 hover:text-zinc-300 text-sm"
              >
                ←
              </button>
            )}
            <h2 className="text-sm font-medium">
              {step === 'type' ? 'Add Track' : `Add ${TRACK_TYPE_CATALOG[selectedType].label} Track`}
            </h2>
          </div>
          <button
            onClick={close}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {step === 'type' && (
          <div className="p-4 space-y-4">
            {(project.trackPresets ?? []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Track Presets</h3>
                  <span className="text-[10px] text-zinc-600">Apply to new tracks</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(project.trackPresets ?? []).map((preset) => {
                    const typeInfo = TRACK_TYPE_CATALOG[preset.trackType];
                    const trackInfo = TRACK_CATALOG[preset.trackName];

                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        aria-label={`Apply track preset ${preset.name}`}
                        className="flex flex-col gap-1.5 p-3 rounded-lg text-left transition-colors bg-[#262626] hover:bg-[#343434] border border-white/6"
                        style={{ borderLeft: `3px solid ${preset.settings.color || typeInfo.color}` }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{trackInfo.emoji}</span>
                          <span className="text-sm font-medium text-zinc-100 truncate">{preset.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                          <span>{typeInfo.label}</span>
                          <span>•</span>
                          <span>{trackInfo.displayName}</span>
                          {preset.effects.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{preset.effects.length} FX</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {typeOrder.map((type) => {
                const info = TRACK_TYPE_CATALOG[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleTypeSelect(type)}
                    className="flex flex-col gap-1.5 p-3 rounded-lg text-left transition-colors relative bg-daw-surface-2 hover:bg-[#484848]"
                    style={{ borderLeft: `3px solid ${info.color}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{info.emoji}</span>
                      <span className="text-sm font-medium">{info.label}</span>
                      <span
                        className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: info.color + '30', color: info.color }}
                      >
                        {info.abbr}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 leading-tight">{info.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 'instrument' && selectedType === 'stems' && (
          <div className="p-4 grid grid-cols-3 gap-2">
            {TRACK_NAMES.map((name) => {
              const info = TRACK_CATALOG[name];
              const count = trackCountByName[name] ?? 0;
              return (
                <button
                  key={name}
                  onClick={() => handleInstrumentSelect(name)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded text-left bg-daw-surface-2 hover:bg-[#484848] cursor-pointer transition-colors relative"
                  style={{ borderLeft: `3px solid ${info.color}` }}
                >
                  <span className="text-lg">{info.emoji}</span>
                  <span className="text-xs font-medium">{info.displayName}</span>
                  {count > 0 && (
                    <span className="absolute top-1 right-1.5 text-[10px] font-bold text-zinc-400">
                      ×{count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {step === 'instrument' && selectedType === 'sample' && (
          <div className="p-5 flex flex-col gap-3">
            <button
              onClick={() => { addTrack('custom', 'sample'); close(); }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.sample.color}` }}
            >
              <span className="text-xl">📂</span>
              <div>
                <div className="text-sm font-medium">Empty Track</div>
                <div className="text-[11px] text-zinc-400">Create a blank sample track — drag audio onto it later</div>
              </div>
            </button>
            <button
              onClick={() => { close(); openFilePicker(); }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.sample.color}` }}
            >
              <span className="text-xl">📁</span>
              <div>
                <div className="text-sm font-medium">Import Audio or MIDI File</div>
                <div className="text-[11px] text-zinc-400">Pick files from your computer to create sample or piano roll tracks</div>
              </div>
            </button>
          </div>
        )}

        {step === 'instrument' && selectedType === 'sequencer' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="text-center mb-2">
              <span className="text-3xl">🎹</span>
              <p className="text-xs text-zinc-400 mt-2">Creates a step sequencer track with a default drum kit. You can add instruments and swap samples after creation.</p>
            </div>
            <button
              onClick={() => {
                addTrack('percussion', 'sequencer');
                close();
              }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.sequencer.color}` }}
            >
              <span className="text-xl">🎹</span>
              <div>
                <div className="text-sm font-medium">Step Sequencer</div>
                <div className="text-[11px] text-zinc-400">16-step pattern with Kick, Snare, Hi-Hat and more — fully customizable</div>
              </div>
            </button>
          </div>
        )}

        {step === 'instrument' && selectedType === 'drumMachine' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="text-center mb-2">
              <span className="text-3xl">🥁</span>
              <p className="text-xs text-zinc-400 mt-2">Creates an MPC-style drum machine track with 16 pads for triggering samples. Fully customizable kit and pattern.</p>
            </div>
            <button
              onClick={() => {
                addTrack('percussion', 'drumMachine');
                close();
              }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.drumMachine.color}` }}
            >
              <span className="text-xl">🥁</span>
              <div>
                <div className="text-sm font-medium">Drum Machine</div>
                <div className="text-[11px] text-zinc-400">16-pad sample trigger with velocity-sensitive pads and pattern sequencing</div>
              </div>
            </button>
          </div>
        )}

        {step === 'instrument' && selectedType === 'pianoRoll' && (
          <div className="p-5 flex flex-col gap-3">
            <div className="text-center mb-2">
              <span className="text-3xl">🎵</span>
              <p className="text-xs text-zinc-400 mt-2">Creates a MIDI piano roll track with a default synth preset and editable note clips.</p>
            </div>
            <button
              onClick={() => {
                addTrack('keyboard', 'pianoRoll');
                close();
              }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.pianoRoll.color}` }}
            >
              <span className="text-xl">🎵</span>
              <div>
                <div className="text-sm font-medium">Piano Roll Track</div>
                <div className="text-[11px] text-zinc-400">MIDI clips with built-in synth presets and note editing.</div>
              </div>
            </button>
            <button
              onClick={() => {
                const track = addTrack('keyboard', 'pianoRoll');
                updateTrack(track.id, { displayName: 'Quick Sampler', synthPreset: 'sampler' });
                setTrackSampler(track.id, { rootNote: 60 });
                close();
                setOpenPianoRoll(track.id);
              }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.pianoRoll.color}` }}
            >
              <span className="text-xl">🎚️</span>
              <div>
                <div className="text-sm font-medium">Sampler Track</div>
                <div className="text-[11px] text-zinc-400">Chromatic MIDI playback from a single loaded audio sample.</div>
              </div>
            </button>
            <button
              onClick={() => {
                close();
                openQuickSamplerFilePicker();
              }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.pianoRoll.color}` }}
            >
              <span className="text-xl">📥</span>
              <div>
                <div className="text-sm font-medium">Quick Sampler From Audio File</div>
                <div className="text-[11px] text-zinc-400">Create a playable instrument and open the sample editor in one step.</div>
              </div>
            </button>
            <button
              onClick={() => { close(); openFilePicker(); }}
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-[#484848] transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.pianoRoll.color}` }}
            >
              <span className="text-xl">📥</span>
              <div>
                <div className="text-sm font-medium">Import MIDI File</div>
                <div className="text-[11px] text-zinc-400">Load .mid files and create piano roll tracks from their note data.</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
