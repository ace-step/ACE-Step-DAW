import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Button, ButtonGroup, getButtonClasses } from '../../src/components/ui/Button';
import { Tooltip } from '../../src/components/ui/Tooltip';
import {
  ContextMenuWrapper,
  ContextMenuItem,
  ContextMenuSeparator,
} from '../../src/components/ui/ContextMenu';

/* ═══════════════════════════════════════════════════════════════
   Button Component Polish
   ═══════════════════════════════════════════════════════════════ */

describe('Button — polish additions', () => {
  it('uses daw-btn-interactive class for micro-interactions', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('daw-btn-interactive');
  });

  it('does NOT use old transition-[color,background-color,transform] class', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('transition-[color,background-color,transform]');
  });

  it('renders loading spinner overlay when loading=true', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('aria-busy')).toBe('true');
    // SVG spinner present in overlay
    const svg = btn.querySelector('svg.animate-spin');
    expect(svg).not.toBeNull();
    // Children hidden with opacity-0
    const childSpan = btn.querySelector('span.opacity-0');
    expect(childSpan).not.toBeNull();
    expect(childSpan?.textContent).toBe('Saving');
  });

  it('does not render spinner when loading=false', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.querySelector('svg.animate-spin')).toBeNull();
    expect(btn.getAttribute('aria-busy')).toBeNull();
    // Children visible (no opacity-0 class)
    expect(btn.querySelector('span.opacity-0')).toBeNull();
  });

  it('loading disables button even without disabled prop', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('primary variant has gradient overlay class', () => {
    render(<Button variant="primary">OK</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-gradient-to-b');
    expect(btn.className).toContain('from-white/[0.08]');
  });

  it('getButtonClasses includes loading cursor class', () => {
    const classes = getButtonClasses({ loading: true });
    expect(classes).toContain('cursor-wait');
  });

  it('getButtonClasses omits loading cursor when not loading', () => {
    const classes = getButtonClasses({ loading: false });
    expect(classes).not.toContain('cursor-wait');
  });
});

describe('ButtonGroup', () => {
  it('renders children inside a role=group container', () => {
    render(
      <ButtonGroup>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('applies connected border styles', () => {
    render(
      <ButtonGroup>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    expect(group.className).toContain('overflow-hidden');
    expect(group.className).toContain('border');
  });
});

/* ═══════════════════════════════════════════════════════════════
   Tooltip Component
   ═══════════════════════════════════════════════════════════════ */

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show tooltip immediately on hover', () => {
    render(
      <Tooltip content="Hello">
        <button>Hover me</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip after delay', () => {
    render(
      <Tooltip content="Hello" delayMs={500}>
        <button>Hover me</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Hello" delayMs={100}>
        <button>Hover me</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText('Hover me'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders keyboard shortcut badge', () => {
    render(
      <Tooltip content="Save" shortcut="Cmd+S" delayMs={0}>
        <button>Save</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('Save'));
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Cmd+S')).toBeInTheDocument();
    expect(screen.getByText('Cmd+S').tagName).toBe('KBD');
  });

  it('does not show tooltip when disabled', () => {
    render(
      <Tooltip content="Hello" disabled delayMs={0}>
        <button>Hover me</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════
   ContextMenu Polish
   ═══════════════════════════════════════════════════════════════ */

describe('ContextMenu — polish additions', () => {
  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuWrapper x={0} y={0} onClose={onClose}>
        <ContextMenuItem label="Item" onClick={vi.fn()} />
      </ContextMenuWrapper>,
    );
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders icon when provided', () => {
    render(
      <ContextMenuWrapper x={0} y={0} onClose={vi.fn()}>
        <ContextMenuItem
          label="Delete"
          onClick={vi.fn()}
          icon={<span data-testid="icon">X</span>}
        />
      </ContextMenuWrapper>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders shortcut in kbd element', () => {
    render(
      <ContextMenuWrapper x={0} y={0} onClose={vi.fn()}>
        <ContextMenuItem label="Copy" onClick={vi.fn()} shortcut="Cmd+C" />
      </ContextMenuWrapper>,
    );
    const shortcut = screen.getByText('Cmd+C');
    expect(shortcut.tagName).toBe('KBD');
  });

  it('disabled items have reduced opacity', () => {
    render(
      <ContextMenuWrapper x={0} y={0} onClose={vi.fn()}>
        <ContextMenuItem label="Disabled" onClick={vi.fn()} disabled />
      </ContextMenuWrapper>,
    );
    const item = screen.getByText('Disabled').closest('button')!;
    expect(item.className).toContain('opacity-40');
  });

  it('separator renders gradient line', () => {
    render(
      <ContextMenuWrapper x={0} y={0} onClose={vi.fn()}>
        <ContextMenuSeparator />
      </ContextMenuWrapper>,
    );
    const seps = document.querySelectorAll('.mx-2.my-1');
    expect(seps.length).toBeGreaterThan(0);
  });

  it('menu uses daw-glass class', () => {
    render(
      <ContextMenuWrapper x={50} y={50} onClose={vi.fn()} testId="menu">
        <span>Hi</span>
      </ContextMenuWrapper>,
    );
    const menu = screen.getByTestId('menu');
    expect(menu.className).toContain('daw-glass');
  });
});
