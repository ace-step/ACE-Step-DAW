/**
 * EffectCards.tsx — Re-exports from per-effect card files.
 *
 * Individual effect cards live in ./effects/.
 * This file preserves the original import path for backward compatibility.
 */
export { HSlider } from '../ui/HSlider';
export {
  EFFECT_COLORS,
  resolveEffectColor,
  AutomationControlShell,
  EQ3Card,
  EQCurve,
  ParametricEQCard,
  CompressorCard,
  ReverbCard,
  DelayCard,
  DistortionCard,
  FilterCard,
  ChorusCard,
  FlangerCard,
  PhaserCard,
  ConvolverCard,
  GateCard,
  DeEsserCard,
  TransientShaperCard,
  LimiterCard,
  SaturationCard,
  StereoImagerCard,
  AlgorithmicReverbCard,
  NoiseReductionCard,
} from './effects';
