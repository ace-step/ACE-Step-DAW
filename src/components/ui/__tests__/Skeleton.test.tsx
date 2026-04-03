import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonText } from '../Skeleton';

describe('Skeleton', () => {
  it('renders a div with shimmer class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('skeleton-shimmer');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies rect variant by default (rounded)', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild!.className).toContain('rounded');
    expect(container.firstElementChild!.className).not.toContain('rounded-full');
  });

  it('applies circle variant (rounded-full)', () => {
    const { container } = render(<Skeleton variant="circle" />);
    expect(container.firstElementChild!.className).toContain('rounded-full');
  });

  it('passes through custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.firstElementChild!.className).toContain('h-4');
    expect(container.firstElementChild!.className).toContain('w-32');
  });

  it('sets data-static when static prop is true', () => {
    const { container } = render(<Skeleton static />);
    expect(container.firstElementChild!.getAttribute('data-static')).toBe('true');
  });

  it('does not set data-static when static prop is false', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild!.getAttribute('data-static')).toBeNull();
  });
});

describe('SkeletonText', () => {
  it('renders 3 skeleton bars by default', () => {
    const { container } = render(<SkeletonText />);
    const bars = container.querySelectorAll('.skeleton-shimmer');
    expect(bars.length).toBe(3);
  });

  it('renders specified number of lines', () => {
    const { container } = render(<SkeletonText lines={5} />);
    const bars = container.querySelectorAll('.skeleton-shimmer');
    expect(bars.length).toBe(5);
  });

  it('last line is shorter (w-3/5)', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const bars = container.querySelectorAll('.skeleton-shimmer');
    const lastBar = bars[bars.length - 1];
    expect(lastBar.className).toContain('w-3/5');
  });

  it('non-last lines are full width', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const bars = container.querySelectorAll('.skeleton-shimmer');
    expect(bars[0].className).toContain('w-full');
    expect(bars[1].className).toContain('w-full');
  });

  it('wrapper has aria-hidden', () => {
    const { container } = render(<SkeletonText />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });
});
