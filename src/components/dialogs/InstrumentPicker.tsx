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
  const addTrack = useProjectStore((s) => s.addTrack);
  const project = useProjectStore((s) => s.project);
  const { openFilePicker } = useAudioImport();

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

  const typeOrder: TrackType[] = ['stems', 'sample', 'sequencer', 'pianoRoll'];
  const isComingSoon = selectedType === 'pianoRoll';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="w-[480px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <div className="flex items-center gap-2">
            {step === 'instrument' && (
              <button
                onClick={() => setStep('type')}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
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
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {step === 'type' && (
          <div className="p-4 grid grid-cols-2 gap-3">
            {typeOrder.map((type) => {
              const info = TRACK_TYPE_CATALOG[type];
              const comingSoon = type === 'pianoRoll';
              return (
                <button
                  key={type}
                  onClick={() => handleTypeSelect(type)}
                  className={`flex flex-col gap-1.5 p-3 rounded-lg text-left transition-colors relative ${
                    comingSoon
                      ? 'bg-daw-surface-2/60 opacity-70 hover:opacity-90'
                      : 'bg-daw-surface-2 hover:bg-zinc-600'
                  }`}
                  style={{ borderLeft: `3px solid ${info.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{info.emoji}</span>
                    <span className="text-sm font-medium">{info.label}</span>
                    <span
                      className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: info.color + '30', color: info.color }}
                    >
                      {info.abbr}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400 leading-tight">{info.description}</span>
                  {comingSoon && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      SOON
                    </span>
                  )}
                </button>
              );
            })}
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
                  className="flex items-center gap-2 px-3 py-2.5 rounded text-left bg-daw-surface-2 hover:bg-zinc-600 cursor-pointer transition-colors relative"
                  style={{ borderLeft: `3px solid ${info.color}` }}
                >
                  <span className="text-lg">{info.emoji}</span>
                  <span className="text-xs font-medium">{info.displayName}</span>
                  {count > 0 && (
                    <span className="absolute top-1 right-1.5 text-[9px] font-bold text-zinc-400">
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
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-zinc-600 transition-colors text-left"
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
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-zinc-600 transition-colors text-left"
              style={{ borderLeft: `3px solid ${TRACK_TYPE_CATALOG.sample.color}` }}
            >
              <span className="text-xl">📁</span>
              <div>
                <div className="text-sm font-medium">Import Audio File</div>
                <div className="text-[11px] text-zinc-400">Pick a file from your computer to create a track with audio</div>
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
              className="flex items-center gap-3 p-3 rounded-lg bg-daw-surface-2 hover:bg-zinc-600 transition-colors text-left"
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

        {step === 'instrument' && isComingSoon && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <span className="text-4xl">{TRACK_TYPE_CATALOG[selectedType].emoji}</span>
            <h3 className="text-base font-medium">{TRACK_TYPE_CATALOG[selectedType].label}</h3>
            <p className="text-sm text-zinc-400 max-w-xs">
              {TRACK_TYPE_CATALOG[selectedType].description}
            </p>
            <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-full">
              Coming Soon
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
