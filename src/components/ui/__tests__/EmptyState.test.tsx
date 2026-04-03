import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title text', () => {
    render(<EmptyState title="No items found" />);
    screen.getByText('No items found'); // getBy* throws if not found
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adding something" />);
    screen.getByText('Try adding something'); // getBy* throws if not found
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="Empty" />);
    const container = screen.getByTestId('empty-state');
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders icon when provided', () => {
    render(
      <EmptyState
        title="Empty"
        icon={<svg data-testid="test-icon" />}
      />,
    );
    screen.getByTestId('test-icon'); // getBy* throws if not found
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Add Item', onClick }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Add Item' });
    expect(button).not.toBeUndefined();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render button when no action provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('applies compact styling when compact is true', () => {
    render(<EmptyState title="Empty" compact />);
    const container = screen.getByTestId('empty-state');
    expect(container.className).toContain('py-6');
  });

  it('applies normal styling when compact is false', () => {
    render(<EmptyState title="Empty" />);
    const container = screen.getByTestId('empty-state');
    expect(container.className).toContain('py-12');
  });

  it('applies custom className', () => {
    render(<EmptyState title="Empty" className="custom-class" />);
    const container = screen.getByTestId('empty-state');
    expect(container.className).toContain('custom-class');
  });
});
