import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, ButtonGroup, getButtonClasses } from '../Button';

describe('Button component', () => {
  describe('rendering', () => {
    it('renders children text', () => {
      render(<Button>Click me</Button>);
      screen.getByRole('button', { name: 'Click me' }); // getBy* throws if not found
    });

    it('renders as a button element by default', () => {
      render(<Button>Test</Button>);
      const btn = screen.getByRole('button');
      expect(btn.tagName).toBe('BUTTON');
    });

    it('forwards additional HTML attributes', () => {
      render(<Button title="My tooltip" data-testid="my-btn">Test</Button>);
      screen.getByTestId('my-btn'); // getBy* throws if not found
      expect(screen.getByRole('button').getAttribute('title')).toBe('My tooltip');
    });
  });

  describe('size variants', () => {
    it('applies sm size classes', () => {
      render(<Button size="sm">Small</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('px-2');
      expect(btn.className).toContain('py-1');
      expect(btn.className).toContain('text-[11px]');
    });

    it('applies md size classes (default)', () => {
      render(<Button>Medium</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('px-3');
      expect(btn.className).toContain('py-1.5');
      expect(btn.className).toContain('text-xs');
    });

    it('applies lg size classes', () => {
      render(<Button size="lg">Large</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('px-4');
      expect(btn.className).toContain('py-2');
      expect(btn.className).toContain('text-sm');
    });
  });

  describe('variant styles', () => {
    it('applies default variant classes', () => {
      render(<Button variant="default">Default</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-daw-surface-2');
      expect(btn.className).toContain('hover:bg-daw-hover');
    });

    it('applies primary variant classes', () => {
      render(<Button variant="primary">Primary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-daw-accent');
      expect(btn.className).toContain('text-white');
    });

    it('applies ghost variant classes', () => {
      render(<Button variant="ghost">Ghost</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-transparent');
      expect(btn.className).toContain('hover:bg-daw-hover-subtle');
    });

    it('applies danger variant classes', () => {
      render(<Button variant="danger">Danger</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('text-red-400');
    });
  });

  describe('consistent border-radius', () => {
    it('uses rounded-md for all sizes', () => {
      const { rerender } = render(<Button size="sm">S</Button>);
      expect(screen.getByRole('button').className).toContain('rounded-md');

      rerender(<Button size="md">M</Button>);
      expect(screen.getByRole('button').className).toContain('rounded-md');

      rerender(<Button size="lg">L</Button>);
      expect(screen.getByRole('button').className).toContain('rounded-md');
    });
  });

  describe('consistent micro-interactions', () => {
    it('uses daw-btn-interactive class on all variants', () => {
      const variants = ['default', 'primary', 'ghost', 'danger'] as const;
      variants.forEach((variant) => {
        const { unmount } = render(<Button variant={variant}>Test</Button>);
        expect(screen.getByRole('button').className).toContain('daw-btn-interactive');
        unmount();
      });
    });
  });

  describe('disabled state', () => {
    it('applies disabled styles when disabled', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('disabled:opacity-50');
      expect(btn.className).toContain('disabled:cursor-not-allowed');
      expect(btn).toHaveProperty('disabled', true);
    });

    it('does not fire onClick when disabled', () => {
      const onClick = vi.fn();
      render(<Button disabled onClick={onClick}>No click</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('active state', () => {
    it('applies active styling when active prop is true', () => {
      render(<Button active>Active</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-daw-accent');
      expect(btn.className).toContain('text-white');
    });
  });

  describe('icon-only variant', () => {
    it('applies icon size classes for sm', () => {
      render(<Button size="sm" icon>X</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('w-6');
      expect(btn.className).toContain('h-6');
    });

    it('applies icon size classes for md', () => {
      render(<Button size="md" icon>X</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('w-7');
      expect(btn.className).toContain('h-7');
    });

    it('applies icon size classes for lg', () => {
      render(<Button size="lg" icon>X</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('w-8');
      expect(btn.className).toContain('h-8');
    });
  });

  describe('onClick handler', () => {
    it('fires onClick when clicked', () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('className merging', () => {
    it('allows custom className to be appended', () => {
      render(<Button className="my-custom-class">Custom</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('my-custom-class');
      // Also still has the base classes
      expect(btn.className).toContain('rounded-md');
    });
  });

  describe('getButtonClasses utility', () => {
    it('returns class string for use outside the component', () => {
      const classes = getButtonClasses({ size: 'sm', variant: 'primary' });
      expect(classes).toContain('rounded-md');
      expect(classes).toContain('bg-daw-accent');
      expect(classes).toContain('px-2');
    });

    it('uses defaults when no options provided', () => {
      const classes = getButtonClasses();
      expect(classes).toContain('rounded-md');
      expect(classes).toContain('px-3');
      expect(classes).toContain('bg-daw-surface-2');
    });
  });

  describe('loading state', () => {
    it('renders a spinner when loading', () => {
      render(<Button loading>Save</Button>);
      const btn = screen.getByRole('button');
      expect(btn.querySelector('svg')).not.toBeNull();
    });

    it('sets aria-busy when loading', () => {
      render(<Button loading>Save</Button>);
      const btn = screen.getByRole('button');
      expect(btn.getAttribute('aria-busy')).toBe('true');
    });

    it('disables the button when loading', () => {
      render(<Button loading>Save</Button>);
      expect(screen.getByRole('button')).toHaveProperty('disabled', true);
    });

    it('does not fire onClick when loading', () => {
      const onClick = vi.fn();
      render(<Button loading onClick={onClick}>Save</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('preserves button width by keeping children visible', () => {
      render(<Button loading>Save</Button>);
      screen.getByText('Save'); // getBy* throws if not found
    });
  });

  describe('icon button circle styling', () => {
    it('applies rounded-full for icon buttons', () => {
      render(<Button icon>X</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('rounded-full');
    });
  });

  describe('ButtonGroup', () => {
    it('renders children within a group', () => {
      render(
        <ButtonGroup>
          <Button>A</Button>
          <Button>B</Button>
        </ButtonGroup>,
      );
      screen.getByText('A'); // getBy* throws if not found
      screen.getByText('B');
    });

    it('has role="group"', () => {
      render(
        <ButtonGroup>
          <Button>A</Button>
        </ButtonGroup>,
      );
      screen.getByRole('group'); // getBy* throws if not found
    });
  });
});
