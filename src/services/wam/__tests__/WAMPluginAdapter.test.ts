import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WAMPluginAdapter } from '../WAMPluginAdapter';
import type { WAMPluginHandle } from '../WAMHost';

function createMockWAMHandle(overrides?: Partial<WAMPluginHandle>): WAMPluginHandle {
  const mockNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    numberOfInputs: 1,
    numberOfOutputs: 1,
    getParameterInfo: vi.fn().mockResolvedValue({
      gain: {
        id: 'gain',
        label: 'Gain',
        type: 'float',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        discreteStep: 0,
        exponent: 1,
      },
      mode: {
        id: 'mode',
        label: 'Mode',
        type: 'choice',
        defaultValue: 0,
        minValue: 0,
        maxValue: 2,
        discreteStep: 1,
        exponent: 1,
        choices: ['Clean', 'Warm', 'Hot'],
      },
    }),
    getParameterValues: vi.fn().mockResolvedValue({
      gain: { id: 'gain', value: 0.5, normalized: false },
      mode: { id: 'mode', value: 0, normalized: false },
    }),
    setParameterValues: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(null),
    setState: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };

  const mockInstance = {
    audioNode: mockNode,
    moduleId: 'test-vendor.test-plugin',
    instanceId: 'instance-1',
    descriptor: {
      identifier: 'test-vendor.test-plugin',
      name: 'Test Plugin',
      vendor: 'Test Vendor',
      version: '1.0.0',
      apiVersion: '2.0.0',
      description: 'A test WAM plugin',
      isInstrument: false,
      thumbnail: '',
      keywords: ['test'],
      website: '',
      hasAudioInput: true,
      hasAudioOutput: true,
      hasMidiInput: false,
      hasMidiOutput: false,
    },
    name: 'Test Plugin',
    vendor: 'Test Vendor',
    createGui: vi.fn().mockResolvedValue(document.createElement('div')),
    destroyGui: vi.fn(),
    initialized: true,
  };

  return {
    instance: mockInstance,
    audioNode: mockNode as unknown as AudioNode,
    moduleId: 'test-vendor.test-plugin',
    instanceId: 'instance-1',
    descriptor: mockInstance.descriptor,
    ...overrides,
  };
}

describe('WAMPluginAdapter', () => {
  let adapter: WAMPluginAdapter;
  let handle: WAMPluginHandle;

  beforeEach(async () => {
    handle = createMockWAMHandle();
    adapter = await WAMPluginAdapter.create(handle);
  });

  it('should expose plugin metadata', () => {
    expect(adapter.name).toBe('Test Plugin');
    expect(adapter.author).toBe('Test Vendor');
    expect(adapter.version).toBe('1.0.0');
    expect(adapter.description).toBe('A test WAM plugin');
    expect(adapter.pluginType).toBe('effect');
  });

  it('should report instrument type for instrument plugins', async () => {
    const instrHandle = createMockWAMHandle();
    instrHandle.descriptor.isInstrument = true;
    const instrAdapter = await WAMPluginAdapter.create(instrHandle);
    expect(instrAdapter.pluginType).toBe('instrument');
  });

  it('should expose parameter descriptors', () => {
    const descs = adapter.getParameterDescriptors();
    expect(descs).toHaveLength(2);

    const gainParam = descs.find((d) => d.id === 'gain');
    expect(gainParam).toBeDefined();
    expect(gainParam!.type).toBe('float');
    expect(gainParam!.name).toBe('Gain');

    const modeParam = descs.find((d) => d.id === 'mode');
    expect(modeParam).toBeDefined();
    expect(modeParam!.type).toBe('enum');
  });

  it('should create audio node with correct input/output', () => {
    const ctx = {} as AudioContext;
    const audioNode = adapter.createAudioNode(ctx);
    // Effect plugin should have input
    expect(audioNode.inputNode).toBeDefined();
    expect(audioNode.outputNode).toBeDefined();
  });

  it('should set parameters via WAM node', () => {
    adapter.setParameter('gain', 0.8);
    expect(handle.instance.audioNode.setParameterValues).toHaveBeenCalledWith(
      { gain: { id: 'gain', value: 0.8, normalized: false } },
    );
  });

  it('should get parameter values', () => {
    // Parameters are cached from initialization
    expect(adapter.getParameter('gain')).toBe(0.5);
    expect(adapter.getParameter('mode')).toBe('Clean');
  });

  it('should get all parameters', () => {
    const params = adapter.getParameters();
    expect(params).toEqual({ gain: 0.5, mode: 'Clean' });
  });

  it('should dispose the WAM instance', () => {
    adapter.dispose();
    expect(handle.instance.audioNode.destroy).toHaveBeenCalled();
  });

  it('should provide access to WAM GUI', async () => {
    const gui = await adapter.createGui();
    expect(gui).toBeInstanceOf(HTMLElement);
    expect(handle.instance.createGui).toHaveBeenCalled();
  });

  it('should destroy GUI', () => {
    const el = document.createElement('div');
    adapter.destroyGui(el);
    expect(handle.instance.destroyGui).toHaveBeenCalledWith(el);
  });

  it('should get/set WAM state for presets', async () => {
    const state = await adapter.getState();
    expect(handle.instance.audioNode.getState).toHaveBeenCalled();

    await adapter.setState({ some: 'data' });
    expect(handle.instance.audioNode.setState).toHaveBeenCalledWith({ some: 'data' });
  });
});
