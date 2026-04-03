import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonText } from '../Skeleton';

describe('Skeleton', () => {
  it('renders with aria-hidden', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies width and height as inline styles', () => {
    render(<Skeleton width={100} height={20} />);
    const el = screen.getByTestId('skeleton');
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('20px');
  });

  it('applies shimmer animation', () => {
    render(<Skeleton />);
    const el = screen.getByTestId('skeleton');
    expect(el.style.animation).toContain('skeleton-shimmer');
  });

  it('applies custom className', () => {
    render(<Skeleton className="my-class" />);
    const el = screen.getByTestId('skeleton');
    expect(el.className).toContain('my-class');
  });

  it('applies rounded variants', () => {
    const { rerender } = render(<Skeleton rounded="full" />);
    expect(screen.getByTestId('skeleton').className).toContain('rounded-full');

    rerender(<Skeleton rounded="sm" />);
    expect(screen.getByTestId('skeleton').className).toContain('rounded-sm');
  });
});

describe('SkeletonText', () => {
  it('renders default 3 lines', () => {
    render(<SkeletonText />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(3);
  });

  it('renders specified number of lines', () => {
    render(<SkeletonText lines={5} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(5);
  });

  it('last line is shorter (60% width)', () => {
    render(<SkeletonText lines={2} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons[1].style.width).toBe('60%');
    expect(skeletons[0].style.width).toBe('100%');
  });
});
