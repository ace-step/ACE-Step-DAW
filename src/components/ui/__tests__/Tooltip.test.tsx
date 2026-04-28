import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

describe('Tooltip component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show tooltip initially', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip after hover delay', () => {
    render(
      <Tooltip content="Help text" delayMs={500}>
        <button>Hover me</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    screen.getByRole('tooltip'); // getBy* throws if not found
    screen.getByText('Help text'); // getBy* throws if not found
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Help text" delayMs={0}>
        <button>Hover me</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    screen.getByRole('tooltip'); // getBy* throws if not found

    fireEvent.mouseLeave(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders keyboard shortcut badge', () => {
    render(
      <Tooltip content="Save" shortcut="Cmd+S" delayMs={0}>
        <button>Save</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(0);
    });

    screen.getByText('Cmd+S'); // getBy* throws if not found
  });

  it('does not show when disabled', () => {
    render(
      <Tooltip content="Help" disabled delayMs={0}>
        <button>Hover me</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('cancels show on quick mouse leave', () => {
    render(
      <Tooltip content="Help text" delayMs={500}>
        <button>Hover me</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(200); // Less than delay
    });
    fireEvent.mouseLeave(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('preserves original event handlers on child', () => {
    const onMouseEnter = vi.fn();
    render(
      <Tooltip content="Help" delayMs={0}>
        <button onMouseEnter={onMouseEnter}>Hover me</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });
});
