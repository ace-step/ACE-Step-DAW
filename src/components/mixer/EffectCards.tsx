/**
 * EffectCards.tsx — Re-exports from per-effect card modules.
 *
 * All effect card components have been extracted into individual files
 * under ./effects/ for maintainability. This barrel re-exports them
 * to preserve existing import paths.
 *
 * To add a new effect: create a new card file in ./effects/ and
 * register it in ./effects/index.ts.
 */
export { HSlider } from '../ui/HSlider';
export {
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
  EFFECT_COLORS,
  resolveEffectColor,
} from './effects';
