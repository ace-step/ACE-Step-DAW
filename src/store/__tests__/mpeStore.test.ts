import { describe, it, expect, beforeEach } from 'vitest';
import { useMpeStore, getMpeZoneManager, setMpeZoneManager } from '../mpeStore';
import { MpeZoneManager } from '../../services/mpeService';

describe('mpeStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useMpeStore.setState({
      enabled: false,
      lowerZoneMembers: 0,
      upperZoneMembers: 0,
      pitchBendRange: 48,
      activeNotes: [],
      autoDetected: false,
    });
    // Fresh zone manager for each test
    setMpeZoneManager(new MpeZoneManager());
  });

  it('starts disabled with no zones', () => {
    const state = useMpeStore.getState();
    expect(state.enabled).toBe(false);
    expect(state.lowerZoneMembers).toBe(0);
    expect(state.upperZoneMembers).toBe(0);
    expect(state.pitchBendRange).toBe(48);
  });

  it('configures lower zone and syncs to zone manager', () => {
    useMpeStore.getState().setLowerZoneMembers(5);
    expect(useMpeStore.getState().lowerZoneMembers).toBe(5);
    const zone = getMpeZoneManager().getLowerZone();
    expect(zone).not.toBeNull();
    expect(zone!.memberCount).toBe(5);
  });

  it('configures upper zone and syncs to zone manager', () => {
    useMpeStore.getState().setUpperZoneMembers(3);
    expect(useMpeStore.getState().upperZoneMembers).toBe(3);
    const zone = getMpeZoneManager().getUpperZone();
    expect(zone!.memberCount).toBe(3);
  });

  it('clamps zone members to 0-14', () => {
    useMpeStore.getState().setLowerZoneMembers(20);
    expect(useMpeStore.getState().lowerZoneMembers).toBe(14);

    useMpeStore.getState().setUpperZoneMembers(-1);
    expect(useMpeStore.getState().upperZoneMembers).toBe(0);
  });

  it('clamps pitch bend range to 1-96', () => {
    useMpeStore.getState().setPitchBendRange(0);
    expect(useMpeStore.getState().pitchBendRange).toBe(1);

    useMpeStore.getState().setPitchBendRange(100);
    expect(useMpeStore.getState().pitchBendRange).toBe(96);
  });

  it('disabling MPE resets zone manager', () => {
    useMpeStore.getState().setEnabled(true);
    useMpeStore.getState().setLowerZoneMembers(5);
    useMpeStore.getState().setEnabled(false);
    expect(getMpeZoneManager().isMpeActive()).toBe(false);
    expect(useMpeStore.getState().activeNotes).toHaveLength(0);
  });

  it('enabling MPE re-applies stored zone config', () => {
    useMpeStore.getState().setLowerZoneMembers(5);
    useMpeStore.getState().setEnabled(false);
    // Zone manager was cleared
    expect(getMpeZoneManager().isMpeActive()).toBe(false);

    useMpeStore.getState().setEnabled(true);
    // Zone should be re-configured from stored state
    expect(getMpeZoneManager().getLowerZone()!.memberCount).toBe(5);
  });

  it('resetZones clears everything', () => {
    useMpeStore.getState().setLowerZoneMembers(5);
    useMpeStore.getState().setUpperZoneMembers(3);
    useMpeStore.getState().resetZones();
    expect(useMpeStore.getState().lowerZoneMembers).toBe(0);
    expect(useMpeStore.getState().upperZoneMembers).toBe(0);
    expect(getMpeZoneManager().isMpeActive()).toBe(false);
  });
});
