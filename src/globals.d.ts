import type { DAWGlobals } from './types/dawActions';

declare global {
  interface Window extends DAWGlobals {}
}
