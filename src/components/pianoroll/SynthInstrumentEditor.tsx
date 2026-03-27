import type { ComponentProps, ReactNode } from 'react';
import type {
  FmTrackInstrument,
  InstrumentWaveform,
  LegacySynthVoicePreset,
  SubtractiveTrackInstrument,
} from '../../types/project';
import { Knob } from '../ui/Knob';

const WAVEFORM_OPTIONS: InstrumentWaveform[] = ['sine', 'triangle', 'square', 'sawtooth'];
const FILTER_TYPE_OPTIONS: Array<SubtractiveTrackInstrument['settings']['filter']['type']> = ['lowpass', 'highpass', 'bandpass'];
const LFO_TARGET_OPTIONS: Array<SubtractiveTrackInstrument['settings']['lfo']['target']> = ['off', 'pitch', 'filterCutoff', 'amp', 'pan'];
const LEGACY_PRESET_OPTIONS: LegacySynthVoicePreset[] = ['piano', 'strings', 'pad', 'lead', 'bass', 'organ'];
const UNISON_VOICE_OPTIONS = [1, 2, 4, 6, 8];

interface SynthInstrumentEditorProps {
  instrument: SubtractiveTrackInstrument | FmTrackInstrument;
  onInstrumentChange: (instrument: SubtractiveTrackInstrument | FmTrackInstrument) => void;
}

interface SectionProps {
  title: string;
  eyebrow?: string;
  accentClassName?: string;
  action?: ReactNode;
  children: ReactNode;
}

function Section({ title, eyebrow, accentClassName, action, children }: SectionProps) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${accentClassName ?? 'border-white/8 bg-white/[0.03]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {eyebrow}
            </div>
          )}
          <div className="text-sm text-zinc-100">{title}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-[10px] text-zinc-400">
      <span className="block mb-1 uppercase tracking-[0.14em]">{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  ariaLabel,
  label,
  value,
  onChange,
  children,
}: {
  ariaLabel: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <FieldLabel label={label}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-[#2d3449] bg-[#101827] px-2 py-1 text-[11px] text-zinc-200"
      >
        {children}
      </select>
    </FieldLabel>
  );
}

function ToggleButton({
  ariaLabel,
  active,
  activeLabel,
  inactiveLabel,
  onClick,
}: {
  ariaLabel: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active ? 'true' : 'false'}
      className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
        active
          ? 'bg-cyan-500/20 text-cyan-100'
          : 'bg-white/5 text-zinc-400 hover:bg-white/10'
      }`}
      onClick={onClick}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function EditorKnob(props: ComponentProps<typeof Knob>) {
  return <Knob size={38} {...props} />;
}

function renderWaveformOptions() {
  return WAVEFORM_OPTIONS.map((waveform) => (
    <option key={waveform} value={waveform}>
      {waveform}
    </option>
  ));
}

function renderPresetOptions() {
  return LEGACY_PRESET_OPTIONS.map((preset) => (
    <option key={preset} value={preset}>
      {preset}
    </option>
  ));
}

function renderSubtractiveEditor(
  instrument: SubtractiveTrackInstrument,
  onInstrumentChange: (instrument: SubtractiveTrackInstrument) => void,
) {
  const { oscillator, ampEnvelope, filter, lfo, unison, glideTime, outputGain } = instrument.settings;

  const updateSettings = (settings: SubtractiveTrackInstrument['settings']) => {
    onInstrumentChange({
      ...instrument,
      settings,
    });
  };

  return (
    <>
      <Section
        title={instrument.name}
        eyebrow="Synth Rack"
        accentClassName="border-cyan-400/25 bg-cyan-300/[0.06]"
        action={(
          <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
            {instrument.preset}
          </span>
        )}
      >
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SelectField
            ariaLabel="Instrument waveform"
            label="Oscillator"
            value={oscillator.waveform}
            onChange={(waveform) => updateSettings({
              ...instrument.settings,
              oscillator: {
                ...oscillator,
                waveform: waveform as InstrumentWaveform,
              },
            })}
          >
            {renderWaveformOptions()}
          </SelectField>
          <div className="rounded border border-white/8 bg-black/15 px-2 py-2 text-[10px] text-zinc-400">
            <div className="uppercase tracking-[0.14em] text-zinc-500">Voice</div>
            <div className="mt-1 text-zinc-200">Canonical subtractive synth state</div>
            <div className="mt-1 text-zinc-500">Edits write directly into `track.instrument`.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-3">
          <EditorKnob
            value={oscillator.octave}
            min={-2}
            max={2}
            defaultValue={0}
            step={1}
            label="Osc Octave"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              oscillator: {
                ...oscillator,
                octave: value,
              },
            })}
          />
          <EditorKnob
            value={oscillator.detuneCents}
            min={-50}
            max={50}
            defaultValue={0}
            step={1}
            label="Osc Detune"
            unit="c"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              oscillator: {
                ...oscillator,
                detuneCents: value,
              },
            })}
          />
          <EditorKnob
            value={oscillator.level}
            min={0}
            max={1}
            defaultValue={0.9}
            step={0.01}
            label="Osc Level"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              oscillator: {
                ...oscillator,
                level: value,
              },
            })}
          />
          <EditorKnob
            value={outputGain}
            min={-18}
            max={12}
            defaultValue={0}
            step={0.5}
            label="Output Gain"
            unit="dB"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              outputGain: value,
            })}
          />
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Amp Envelope</div>
          <div className="mt-2 grid grid-cols-4 gap-3">
            <EditorKnob
              value={ampEnvelope.attack}
              min={0}
              max={2}
              defaultValue={0.01}
              step={0.01}
              label="Amp Attack"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  attack: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.decay}
              min={0}
              max={2}
              defaultValue={0.2}
              step={0.01}
              label="Amp Decay"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  decay: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.sustain}
              min={0}
              max={1}
              defaultValue={0.7}
              step={0.01}
              label="Amp Sustain"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  sustain: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.release}
              min={0}
              max={5}
              defaultValue={0.5}
              step={0.01}
              label="Amp Release"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  release: value,
                },
              })}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Filter, Modulation, and Width"
        eyebrow="Motion"
        action={(
          <div className="flex items-center gap-2">
            <ToggleButton
              ariaLabel="Toggle synth filter"
              active={filter.enabled}
              activeLabel="Filter On"
              inactiveLabel="Filter Off"
              onClick={() => updateSettings({
                ...instrument.settings,
                filter: {
                  ...filter,
                  enabled: !filter.enabled,
                },
              })}
            />
            <ToggleButton
              ariaLabel="Toggle synth lfo"
              active={lfo.enabled}
              activeLabel="LFO On"
              inactiveLabel="LFO Off"
              onClick={() => updateSettings({
                ...instrument.settings,
                lfo: {
                  ...lfo,
                  enabled: !lfo.enabled,
                },
              })}
            />
          </div>
        )}
      >
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SelectField
            ariaLabel="Instrument filter type"
            label="Filter Type"
            value={filter.type}
            onChange={(type) => updateSettings({
              ...instrument.settings,
              filter: {
                ...filter,
                type: type as SubtractiveTrackInstrument['settings']['filter']['type'],
              },
            })}
          >
            {FILTER_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectField>
          <SelectField
            ariaLabel="Instrument LFO target"
            label="LFO Target"
            value={lfo.target}
            onChange={(target) => updateSettings({
              ...instrument.settings,
              lfo: {
                ...lfo,
                target: target as SubtractiveTrackInstrument['settings']['lfo']['target'],
              },
            })}
          >
            {LFO_TARGET_OPTIONS.map((target) => (
              <option key={target} value={target}>
                {target}
              </option>
            ))}
          </SelectField>
          <SelectField
            ariaLabel="Instrument LFO waveform"
            label="LFO Waveform"
            value={lfo.waveform}
            onChange={(waveform) => updateSettings({
              ...instrument.settings,
              lfo: {
                ...lfo,
                waveform: waveform as InstrumentWaveform,
              },
            })}
          >
            {renderWaveformOptions()}
          </SelectField>
          <FieldLabel label="Retrigger">
            <button
              type="button"
              aria-label="Toggle synth LFO retrigger"
              aria-pressed={lfo.retrigger ? 'true' : 'false'}
              className={`w-full rounded border px-2 py-1 text-[11px] transition-colors ${
                lfo.retrigger
                  ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                  : 'border-white/10 bg-black/15 text-zinc-400 hover:bg-white/5'
              }`}
              onClick={() => updateSettings({
                ...instrument.settings,
                lfo: {
                  ...lfo,
                  retrigger: !lfo.retrigger,
                },
              })}
            >
              {lfo.retrigger ? 'Restart per note' : 'Free running'}
            </button>
          </FieldLabel>
        </div>

        <div className={`mt-3 grid grid-cols-4 gap-3 ${filter.enabled ? '' : 'opacity-45'}`}>
          <EditorKnob
            value={filter.cutoffHz}
            min={80}
            max={16000}
            defaultValue={7200}
            step={10}
            label="Filter Cutoff"
            unit="Hz"
            disabled={!filter.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              filter: {
                ...filter,
                cutoffHz: value,
              },
            })}
          />
          <EditorKnob
            value={filter.resonance}
            min={0}
            max={20}
            defaultValue={0.2}
            step={0.1}
            label="Filter Resonance"
            disabled={!filter.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              filter: {
                ...filter,
                resonance: value,
              },
            })}
          />
          <EditorKnob
            value={filter.drive}
            min={0}
            max={1}
            defaultValue={0}
            step={0.01}
            label="Filter Drive"
            disabled={!filter.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              filter: {
                ...filter,
                drive: value,
              },
            })}
          />
          <EditorKnob
            value={filter.keyTracking}
            min={0}
            max={1}
            defaultValue={0.1}
            step={0.01}
            label="Filter Key Track"
            disabled={!filter.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              filter: {
                ...filter,
                keyTracking: value,
              },
            })}
          />
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3">
          <EditorKnob
            value={lfo.rateHz}
            min={0.1}
            max={20}
            defaultValue={5}
            step={0.1}
            label="LFO Rate"
            unit="Hz"
            disabled={!lfo.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              lfo: {
                ...lfo,
                rateHz: value,
              },
            })}
          />
          <EditorKnob
            value={lfo.depth}
            min={0}
            max={1}
            defaultValue={0}
            step={0.01}
            label="LFO Depth"
            disabled={!lfo.enabled}
            onChange={(value) => updateSettings({
              ...instrument.settings,
              lfo: {
                ...lfo,
                depth: value,
              },
            })}
          />
          <EditorKnob
            value={glideTime}
            min={0}
            max={1}
            defaultValue={0}
            step={0.01}
            label="Glide Time"
            unit="s"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              glideTime: value,
            })}
          />
          <EditorKnob
            value={unison.detuneCents}
            min={0}
            max={40}
            defaultValue={0}
            step={0.5}
            label="Unison Detune"
            unit="c"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              unison: {
                ...unison,
                detuneCents: value,
              },
            })}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <SelectField
            ariaLabel="Instrument unison voices"
            label="Unison Voices"
            value={String(unison.voices)}
            onChange={(voices) => updateSettings({
              ...instrument.settings,
              unison: {
                ...unison,
                voices: Number(voices),
              },
            })}
          >
            {UNISON_VOICE_OPTIONS.map((voices) => (
              <option key={voices} value={voices}>
                {voices}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <EditorKnob
              value={unison.stereoSpread}
              min={0}
              max={1}
              defaultValue={0}
              step={0.01}
              label="Unison Spread"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                unison: {
                  ...unison,
                  stereoSpread: value,
                },
              })}
            />
            <EditorKnob
              value={unison.blend}
              min={0}
              max={1}
              defaultValue={1}
              step={0.01}
              label="Unison Blend"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                unison: {
                  ...unison,
                  blend: value,
                },
              })}
            />
          </div>
        </div>
      </Section>
    </>
  );
}

function renderFmEditor(
  instrument: FmTrackInstrument,
  onInstrumentChange: (instrument: FmTrackInstrument) => void,
) {
  const { carrier, modulator, modulationIndex, feedback, ampEnvelope, outputGain } = instrument.settings;
  const { fallbackPreset } = instrument;

  const updateSettings = (settings: FmTrackInstrument['settings']) => {
    onInstrumentChange({
      ...instrument,
      settings,
    });
  };

  return (
    <>
      <Section
        title={instrument.name}
        eyebrow="FM Rack"
        accentClassName="border-fuchsia-400/25 bg-fuchsia-300/[0.06]"
        action={(
          <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-fuchsia-100">
            FM
          </span>
        )}
      >
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SelectField
            ariaLabel="Instrument FM fallback preset"
            label="Fallback Voice"
            value={fallbackPreset}
            onChange={(preset) => onInstrumentChange({
              ...instrument,
              fallbackPreset: preset as LegacySynthVoicePreset,
            })}
          >
            {renderPresetOptions()}
          </SelectField>
          <div className="rounded border border-white/8 bg-black/15 px-2 py-2 text-[10px] text-zinc-400">
            <div className="uppercase tracking-[0.14em] text-zinc-500">Playback</div>
            <div className="mt-1 text-zinc-200">FM parameters drive the live playback voice</div>
            <div className="mt-1 text-zinc-500">Fallback preset stays as compatibility metadata for legacy paths.</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded border border-white/8 bg-black/15 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Carrier</div>
            <div className="mt-2">
              <SelectField
                ariaLabel="FM carrier waveform"
                label="Waveform"
                value={carrier.waveform}
                onChange={(waveform) => updateSettings({
                  ...instrument.settings,
                  carrier: {
                    ...carrier,
                    waveform: waveform as InstrumentWaveform,
                  },
                })}
              >
                {renderWaveformOptions()}
              </SelectField>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EditorKnob
                value={carrier.ratio}
                min={0.25}
                max={8}
                defaultValue={1}
                step={0.25}
                label="Carrier Ratio"
                onChange={(value) => updateSettings({
                  ...instrument.settings,
                  carrier: {
                    ...carrier,
                    ratio: value,
                  },
                })}
              />
              <EditorKnob
                value={carrier.level}
                min={0}
                max={1}
                defaultValue={1}
                step={0.01}
                label="Carrier Level"
                onChange={(value) => updateSettings({
                  ...instrument.settings,
                  carrier: {
                    ...carrier,
                    level: value,
                  },
                })}
              />
            </div>
          </div>

          <div className="rounded border border-white/8 bg-black/15 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Modulator</div>
            <div className="mt-2">
              <SelectField
                ariaLabel="FM modulator waveform"
                label="Waveform"
                value={modulator.waveform}
                onChange={(waveform) => updateSettings({
                  ...instrument.settings,
                  modulator: {
                    ...modulator,
                    waveform: waveform as InstrumentWaveform,
                  },
                })}
              >
                {renderWaveformOptions()}
              </SelectField>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EditorKnob
                value={modulator.ratio}
                min={0.25}
                max={8}
                defaultValue={2}
                step={0.25}
                label="Modulator Ratio"
                onChange={(value) => updateSettings({
                  ...instrument.settings,
                  modulator: {
                    ...modulator,
                    ratio: value,
                  },
                })}
              />
              <EditorKnob
                value={modulator.level}
                min={0}
                max={1}
                defaultValue={0.75}
                step={0.01}
                label="Modulator Level"
                onChange={(value) => updateSettings({
                  ...instrument.settings,
                  modulator: {
                    ...modulator,
                    level: value,
                  },
                })}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Modulation Index and Envelope" eyebrow="Dynamics">
        <div className="mt-3 grid grid-cols-3 gap-3">
          <EditorKnob
            value={modulationIndex}
            min={0}
            max={12}
            defaultValue={2}
            step={0.1}
            label="Modulation Index"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              modulationIndex: value,
            })}
          />
          <EditorKnob
            value={feedback}
            min={0}
            max={1}
            defaultValue={0}
            step={0.01}
            label="FM Feedback"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              feedback: value,
            })}
          />
          <EditorKnob
            value={outputGain}
            min={-18}
            max={12}
            defaultValue={0}
            step={0.5}
            label="Output Gain"
            unit="dB"
            onChange={(value) => updateSettings({
              ...instrument.settings,
              outputGain: value,
            })}
          />
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Amp Envelope</div>
          <div className="mt-2 grid grid-cols-4 gap-3">
            <EditorKnob
              value={ampEnvelope.attack}
              min={0}
              max={2}
              defaultValue={0.01}
              step={0.01}
              label="Amp Attack"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  attack: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.decay}
              min={0}
              max={2}
              defaultValue={0.2}
              step={0.01}
              label="Amp Decay"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  decay: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.sustain}
              min={0}
              max={1}
              defaultValue={0.7}
              step={0.01}
              label="Amp Sustain"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  sustain: value,
                },
              })}
            />
            <EditorKnob
              value={ampEnvelope.release}
              min={0}
              max={5}
              defaultValue={0.5}
              step={0.01}
              label="Amp Release"
              unit="s"
              onChange={(value) => updateSettings({
                ...instrument.settings,
                ampEnvelope: {
                  ...ampEnvelope,
                  release: value,
                },
              })}
            />
          </div>
        </div>
      </Section>
    </>
  );
}

export function SynthInstrumentEditor({ instrument, onInstrumentChange }: SynthInstrumentEditorProps) {
  return (
    <div className="grid grid-cols-[minmax(240px,1.25fr)_minmax(220px,1fr)] gap-3 border-b border-[#1f2536] bg-[#0b1220] px-3 py-3 shrink-0">
      {instrument.kind === 'fm'
        ? renderFmEditor(instrument, onInstrumentChange)
        : renderSubtractiveEditor(instrument, onInstrumentChange)}
    </div>
  );
}
