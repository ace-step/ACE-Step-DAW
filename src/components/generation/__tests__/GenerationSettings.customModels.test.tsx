import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSettingsSection } from '../GenerationSettingsSection';
import { useProjectStore } from '../../../store/projectStore';
import { useCustomModelStore } from '../../../store/customModelStore';
import type { CustomModel } from '../../../types/api';

vi.mock('../../../services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue({
    models: [{ name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego'] }],
    lm_models: [],
    default_model: 'ace-step-v1',
    loaded_lm_model: null,
    llm_initialized: false,
  }),
  initModel: vi.fn().mockResolvedValue({ message: 'ok' }),
  getBackendUrl: vi.fn().mockReturnValue(''),
  setBackendUrl: vi.fn(),
  listCustomModels: vi.fn().mockResolvedValue({ models: [] }),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const sampleCustomModel: CustomModel = {
  id: 'custom-1',
  name: 'My Rock Style',
  description: 'Rock music model',
  trackCount: 5,
  styleTags: ['rock'],
  trainedAt: Date.now(),
  trainingJobId: 'job-1',
  modelPath: '/models/custom/rock-style',
};

describe('GenerationSettingsSection — Custom Models', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        id: 'test-project',
        name: 'Test',
        bpm: 120,
        timeSignature: '4/4',
        keyScale: 'C major',
        duration: 30,
        tracks: [],
        masterVolume: 0.8,
        masterPan: 0,
        masterEffects: [],
        scenes: [],
        markers: [],
      },
    });
    useCustomModelStore.setState({
      customModels: [],
      trainingTracks: [],
      trainingJobs: {},
      isUploading: false,
      uploadError: null,
      trainingError: null,
    });
  });

  it('shows custom models in model selector when available', async () => {
    useCustomModelStore.setState({ customModels: [sampleCustomModel] });
    render(<GenerationSettingsSection active />);

    // Wait for initial model fetch
    await vi.waitFor(() => {
      expect(screen.getByText(/my rock style/i)).toBeInTheDocument();
    });
  });

  it('shows custom model with (custom) suffix', async () => {
    useCustomModelStore.setState({ customModels: [sampleCustomModel] });
    render(<GenerationSettingsSection active />);

    await vi.waitFor(() => {
      const option = screen.getByText(/my rock style \(custom\)/i);
      expect(option).toBeInTheDocument();
      expect(option.closest('optgroup')).toHaveAttribute('label', 'Custom Models');
    });
  });

  it('does not show custom models section when none exist', async () => {
    render(<GenerationSettingsSection active />);

    await vi.waitFor(() => {
      expect(screen.queryByText(/custom models/i)).not.toBeInTheDocument();
    });
  });
});
