import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepContextMenu } from '../StepContextMenu';

function renderStepMenu(overrides: Partial<Parameters<typeof StepContextMenu>[0]> = {}) {
  const defaults = {
    x: 100,
    y: 200,
    currentProbability: 1,
    currentVelocity: 0.8,
    stepParams: {},
    onSetProbability: vi.fn(),
    onSetVelocity: vi.fn(),
    onClose: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<StepContextMenu {...props} />), props };
}

describe('StepContextMenu', () => {
  it('renders probability section', () => {
    renderStepMenu();
    expect(screen.getByText('Probability')).toBeInTheDocument();
  });

  it('renders velocity section', () => {
    renderStepMenu();
    expect(screen.getByText('Velocity')).toBeInTheDocument();
  });

  it('renders probability preset buttons', () => {
    renderStepMenu();
    // Use getAllByText since the value display may also show "100%"
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('calls onSetProbability and onClose when clicking a preset', () => {
    const { props } = renderStepMenu();
    fireEvent.click(screen.getByText('50%'));
    expect(props.onSetProbability).toHaveBeenCalledWith(0.5);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('renders probability slider with correct value', () => {
    renderStepMenu({ currentProbability: 0.75 });
    const sliders = screen.getAllByRole('slider');
    const probSlider = sliders[0]; // First slider is probability
    expect(probSlider).toHaveValue('75');
  });

  it('calls onSetProbability when changing probability slider', () => {
    const { props } = renderStepMenu();
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '60' } });
    expect(props.onSetProbability).toHaveBeenCalledWith(0.6);
  });

  it('renders velocity slider with correct value (0-127)', () => {
    renderStepMenu({ currentVelocity: 1.0 });
    const sliders = screen.getAllByRole('slider');
    const velSlider = sliders[1]; // Second slider is velocity
    expect(velSlider).toHaveValue('127');
  });

  it('calls onSetVelocity when changing velocity slider', () => {
    const { props } = renderStepMenu();
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[1], { target: { value: '100' } });
    expect(props.onSetVelocity).toHaveBeenCalledWith(100 / 127);
  });

  it('does not show param locks info when no params', () => {
    renderStepMenu({ stepParams: {} });
    expect(screen.queryByText(/param lock/)).not.toBeInTheDocument();
  });

  it('shows param locks count when params exist', () => {
    renderStepMenu({ stepParams: { pitch: 0.7, decay: 0.3 } });
    expect(screen.getByText('2 param locks set')).toBeInTheDocument();
  });

  it('shows singular param lock text for single param', () => {
    renderStepMenu({ stepParams: { pitch: 0.7 } });
    expect(screen.getByText('1 param lock set')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    const { props } = renderStepMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('closes on outside click', () => {
    const { props } = renderStepMenu();
    fireEvent.mouseDown(document.body);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('does not close on click inside menu', () => {
    const { props } = renderStepMenu();
    const probLabel = screen.getByText('Probability');
    fireEvent.mouseDown(probLabel);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('clamps menu position within viewport', () => {
    const { container } = renderStepMenu({ x: 99999, y: 99999 });
    const menu = container.firstElementChild as HTMLElement;
    const left = parseInt(menu.style.left);
    const top = parseInt(menu.style.top);
    // Should be clamped to viewport
    expect(left).toBeLessThan(99999);
    expect(top).toBeLessThan(99999);
  });
});
