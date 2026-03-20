import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContextMenuWrapper,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  CONTEXT_MENU,
} from '../../src/components/ui/ContextMenu';

// jsdom normalizes hex colors to rgb(), so we compare against that
const RGB_BG = 'rgb(42, 42, 42)';        // #2a2a2a
const RGB_BORDER = 'rgb(68, 68, 68)';     // #444
const RGB_DANGER = 'rgb(231, 76, 60)';    // #e74c3c

describe('ContextMenuWrapper', () => {
  it('renders children and positions at given x/y', () => {
    render(
      <ContextMenuWrapper x={100} y={200} onClose={vi.fn()}>
        <span>Hello</span>
      </ContextMenuWrapper>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls onClose when clicking the backdrop', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuWrapper x={0} y={0} onClose={onClose}>
        <span>Menu</span>
      </ContextMenuWrapper>,
    );
    // The backdrop is the first fixed div (inset-0)
    const backdrop = screen.getByText('Menu').parentElement!.previousElementSibling! as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on right-click on backdrop', () => {
    const onClose = vi.fn();
    render(
      <ContextMenuWrapper x={0} y={0} onClose={onClose}>
        <span>Menu</span>
      </ContextMenuWrapper>,
    );
    const backdrop = screen.getByText('Menu').parentElement!.previousElementSibling! as HTMLElement;
    fireEvent.contextMenu(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies consistent background, border, and border-radius', () => {
    render(
      <ContextMenuWrapper x={50} y={50} onClose={vi.fn()} testId="test-menu">
        <span>Item</span>
      </ContextMenuWrapper>,
    );
    const menu = screen.getByTestId('test-menu');
    expect(menu.style.background).toBe(RGB_BG);
    expect(menu.style.border).toContain('1px solid');
    expect(menu.style.borderRadius).toBe(`${CONTEXT_MENU.borderRadius}px`);
  });

  it('clamps x so menu stays on screen', () => {
    // innerWidth defaults to 1024 in jsdom
    render(
      <ContextMenuWrapper x={2000} y={50} onClose={vi.fn()} testId="clamped">
        <span>Clamped</span>
      </ContextMenuWrapper>,
    );
    const menu = screen.getByTestId('clamped');
    const left = parseInt(menu.style.left, 10);
    expect(left).toBeLessThan(2000);
  });

  it('supports custom minWidth', () => {
    render(
      <ContextMenuWrapper x={50} y={50} onClose={vi.fn()} minWidth={250} testId="wide-menu">
        <span>Wide</span>
      </ContextMenuWrapper>,
    );
    const menu = screen.getByTestId('wide-menu');
    expect(menu.style.minWidth).toBe('250px');
  });
});

describe('ContextMenuItem', () => {
  it('renders label and calls onClick', () => {
    const handler = vi.fn();
    render(<ContextMenuItem label="Cut" onClick={handler} />);
    const btn = screen.getByText('Cut');
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses consistent font size', () => {
    render(<ContextMenuItem label="Paste" onClick={vi.fn()} />);
    const btn = screen.getByText('Paste').closest('button')!;
    expect(btn.style.fontSize).toBe(`${CONTEXT_MENU.fontSize}px`);
  });

  it('renders danger items in red', () => {
    render(<ContextMenuItem label="Delete" onClick={vi.fn()} danger />);
    const btn = screen.getByText('Delete').closest('button')!;
    expect(btn.style.color).toBe(RGB_DANGER);
  });

  it('shows danger hover background on mouseEnter', () => {
    render(<ContextMenuItem label="Delete" onClick={vi.fn()} danger />);
    const btn = screen.getByText('Delete').closest('button')!;
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toContain('rgba(231, 76, 60');
  });

  it('shows normal hover background on mouseEnter', () => {
    render(<ContextMenuItem label="Edit" onClick={vi.fn()} />);
    const btn = screen.getByText('Edit').closest('button')!;
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toContain('rgba(74, 144, 217');
  });

  it('resets hover background on mouseLeave', () => {
    render(<ContextMenuItem label="Edit" onClick={vi.fn()} />);
    const btn = screen.getByText('Edit').closest('button')!;
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    expect(btn.style.background).toBe('transparent');
  });

  it('renders keyboard shortcut', () => {
    render(<ContextMenuItem label="Split" onClick={vi.fn()} shortcut="S" />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('does not fire onClick when disabled', () => {
    const handler = vi.fn();
    render(<ContextMenuItem label="Disabled" onClick={handler} disabled />);
    const btn = screen.getByText('Disabled').closest('button')!;
    fireEvent.click(btn);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not change background on hover when disabled', () => {
    render(<ContextMenuItem label="Disabled" onClick={vi.fn()} disabled />);
    const btn = screen.getByText('Disabled').closest('button')!;
    fireEvent.mouseEnter(btn);
    expect(btn.style.background).toBe('transparent');
  });

  it('supports custom accent color', () => {
    render(<ContextMenuItem label="Special" onClick={vi.fn()} color="#ff00ff" />);
    const btn = screen.getByText('Special').closest('button')!;
    expect(btn.style.color).toBe('rgb(255, 0, 255)');
  });
});

describe('ContextMenuSeparator', () => {
  it('renders a separator line with consistent color', () => {
    const { container } = render(<ContextMenuSeparator />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.style.background).toBe(RGB_BORDER); // separatorColor = #444
    expect(sep.style.height).toBe('1px');
  });
});

describe('ContextMenuSubmenu', () => {
  it('renders children with consistent styling', () => {
    const { container } = render(
      <ContextMenuSubmenu>
        <span>Sub item</span>
      </ContextMenuSubmenu>,
    );
    expect(screen.getByText('Sub item')).toBeInTheDocument();
    const submenu = container.firstChild as HTMLElement;
    expect(submenu.style.background).toBe(RGB_BG);
    expect(submenu.style.border).toContain('1px solid');
    expect(submenu.style.borderRadius).toBe(`${CONTEXT_MENU.borderRadius}px`);
  });
});
