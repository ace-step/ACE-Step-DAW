import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Knob } from '../../src/components/ui/Knob';
import { MiniKnob } from '../../src/components/sequencer/MiniKnob';
import { HSlider } from '../../src/components/mixer/EffectCards';
import { DualRangeSlider } from '../../src/components/ui/DualRangeSlider';

describe('control interaction standards', () => {
  const requestPointerLock = vi.fn();
  const exitPointerLock = vi.fn();

  beforeEach(() => {
    requestPointerLock.mockReset();
    exitPointerLock.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: requestPointerLock,
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: exitPointerLock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a precision input for Knob and commits an exact value', () => {
    const onChange = vi.fn();
    render(
      <Knob
        value={0.4}
        min={0}
        max={1}
        defaultValue={0.5}
        step={0.1}
        label="Gain"
        onChange={onChange}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText('Gain knob'));

    const input = screen.getByRole('spinbutton', { name: 'Gain exact value' });
    fireEvent.change(input, { target: { value: '0.8' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(0.8);
    expect(screen.queryByRole('spinbutton', { name: 'Gain exact value' })).not.toBeInTheDocument();
  });

  it('tracks vertical drag on Knob and updates value on mouse up', () => {
    const onChange = vi.fn();
    render(
      <Knob
        value={0.5}
        min={0}
        max={1}
        defaultValue={0.5}
        label="Pan"
        onChange={onChange}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Pan knob'), { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 180 });
    fireEvent.mouseUp(window);

    expect(onChange).toHaveBeenCalled();
  });

  it('opens a precision input for MiniKnob, supports wheel adjust, and uses pointer lock', () => {
    const onChange = vi.fn();
    render(
      <MiniKnob
        value={0.4}
        min={0}
        max={1}
        label="Swing"
        onChange={onChange}
      />,
    );

    const knob = screen.getByLabelText('Swing mini knob');

    fireEvent.contextMenu(knob);
    const input = screen.getByRole('spinbutton', { name: 'Swing exact value' });
    fireEvent.change(input, { target: { value: '0.75' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.75);

    onChange.mockClear();
    fireEvent.wheel(knob, { deltaY: -120 });
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    fireEvent.mouseDown(knob, { clientY: 200 });
    fireEvent.mouseMove(window, { movementY: -12, clientY: 188 });
    fireEvent.mouseUp(window);
    expect(requestPointerLock).toHaveBeenCalled();
    expect(exitPointerLock).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it('supports precision input and double-click reset for HSlider', () => {
    const onChange = vi.fn();
    render(
      <HSlider
        value={0.6}
        min={0}
        max={1}
        defaultValue={0.25}
        label="Dry/Wet"
        onChange={onChange}
      />,
    );

    const slider = screen.getByLabelText('Dry/Wet slider');
    fireEvent.contextMenu(slider);
    const input = screen.getByRole('spinbutton', { name: 'Dry/Wet exact value' });
    fireEvent.change(input, { target: { value: '0.4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.4);

    onChange.mockClear();
    fireEvent.doubleClick(slider);
    expect(onChange).toHaveBeenCalledWith(0.25);
  });

  it('supports precision input for each DualRangeSlider thumb', () => {
    const onChange = vi.fn();
    render(
      <DualRangeSlider
        min={0}
        max={10}
        startValue={2}
        endValue={8}
        step={0.5}
        onChange={onChange}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText('Range start handle'));
    const startInput = screen.getByRole('spinbutton', { name: 'Start exact value' });
    fireEvent.change(startInput, { target: { value: '3.5' } });
    fireEvent.keyDown(startInput, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(3.5, 8);

    onChange.mockClear();
    fireEvent.contextMenu(screen.getByLabelText('Range end handle'));
    const endInput = screen.getByRole('spinbutton', { name: 'End exact value' });
    fireEvent.change(endInput, { target: { value: '7.5' } });
    fireEvent.keyDown(endInput, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(2, 7.5);
  });
});
