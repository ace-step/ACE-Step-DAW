import type { AutomationLane, AutomationParameter } from '../types/project';
import { automationParamEquals, normalizedToMixerValue } from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { effectsEngine } from './EffectsEngine';

/**
 * Automation playback engine.
 * Reads automation lanes and applies values to audio parameters in real-time.
 */
export class AutomationEngine {
  private animFrameId: number | null = null;
  private lanes: AutomationLane[] = [];
  private getTime: (() => number) | null = null;
  private trackVolumes: Map<string, number> = new Map();
  private trackPans: Map<string, number> = new Map();
  private effectValues: Map<string, number> = new Map();

  /**
   * Start applying automation during playback
   */
  start(
    lanes: AutomationLane[],
    getCurrentTime: () => number,
  ) {
    this.lanes = lanes;
    this.getTime = getCurrentTime;
    this.trackVolumes.clear();
    this.trackPans.clear();
    this.effectValues.clear();
    this.tick();
  }

  /**
   * Stop automation playback
   */
  stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.getTime = null;
    this.trackVolumes.clear();
    this.trackPans.clear();
    this.effectValues.clear();
  }

  /**
   * Update lanes (e.g., when user edits during playback)
   */
  updateLanes(lanes: AutomationLane[]) {
    this.lanes = lanes;
  }

  /**
   * Get the interpolated value at a given time for a lane
   */
  static getValueAtTime(lane: AutomationLane, time: number): number | null {
    const points = lane.points;
    if (points.length === 0) return null;

    if (time <= points[0].time) return points[0].value;
    if (time >= points[points.length - 1].time) return points[points.length - 1].value;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (time >= p0.time && time <= p1.time) {
        const t = (time - p0.time) / (p1.time - p0.time);
        const curve = p0.curve ?? 0;
        if (Math.abs(curve) < 0.01) {
          return p0.value + (p1.value - p0.value) * t;
        }
        const ct = curve > 0
          ? Math.pow(t, 1 + curve * 3)
          : 1 - Math.pow(1 - t, 1 + Math.abs(curve) * 3);
        return p0.value + (p1.value - p0.value) * ct;
      }
    }
    return points[points.length - 1].value;
  }

  private tick = () => {
    if (!this.getTime) return;
    const time = this.getTime();

    for (const lane of this.lanes) {
      if (lane.points.length === 0) continue;

      const value = AutomationEngine.getValueAtTime(lane, time);
      if (value === null) continue;

      this.applyValue(lane.trackId, lane.parameter, value);
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private applyValue(trackId: string, param: AutomationParameter, normalized: number) {
    if (param.type === 'mixer') {
      if (param.param === 'volume') {
        const last = this.trackVolumes.get(trackId);
        if (last !== undefined && Math.abs(last - normalized) < 0.001) return;
        this.trackVolumes.set(trackId, normalized);
        getAudioEngine().setTrackVolume(trackId, normalized);
      } else if (param.param === 'pan') {
        const last = this.trackPans.get(trackId);
        if (last !== undefined && Math.abs(last - normalized) < 0.001) return;
        this.trackPans.set(trackId, normalized);
        const panValue = normalizedToMixerValue('pan', normalized);
        getAudioEngine().setTrackPan(trackId, panValue);
      }
      return;
    }

    if (param.type === 'effect') {
      const key = `${trackId}:${param.effectId}:${param.param}`;
      const last = this.effectValues.get(key);
      if (last !== undefined && Math.abs(last - normalized) < 0.001) return;
      this.effectValues.set(key, normalized);
      effectsEngine.applyAutomationValue(trackId, param.effectId, param, normalized);
    }
  }

  getCurrentValue(trackId: string, param: AutomationParameter): number | null {
    if (!this.getTime) return null;
    const time = this.getTime();

    for (const lane of this.lanes) {
      if (lane.trackId === trackId && automationParamEquals(lane.parameter, param)) {
        return AutomationEngine.getValueAtTime(lane, time);
      }
    }
    return null;
  }

  hasAutomation(trackId: string, param: AutomationParameter): boolean {
    return this.lanes.some(
      (l) => l.trackId === trackId && automationParamEquals(l.parameter, param) && l.points.length > 0
    );
  }

  get isRunning(): boolean {
    return this.animFrameId !== null;
  }
}

export const automationEngine = new AutomationEngine();
