import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '../ErrorBoundary';

// Suppress React error boundary console output during tests
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

function ThrowingComponent({ message }: { message: string }) {
  throw new Error(message);
}

function WorkingComponent() {
  return <div data-testid="working">Hello</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary name="Test">
        <WorkingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('working')).toBeInTheDocument();
  });

  it('shows fallback UI when child throws', () => {
    render(
      <ErrorBoundary name="TestPanel">
        <ThrowingComponent message="boom" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('error-boundary-TestPanel')).toBeInTheDocument();
    expect(screen.getByText('TestPanel encountered an error')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('shows Retry and Reload buttons', () => {
    render(
      <ErrorBoundary name="Test">
        <ThrowingComponent message="fail" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload App' })).toBeInTheDocument();
  });

  it('shows auto-save message', () => {
    render(
      <ErrorBoundary name="Test">
        <ThrowingComponent message="fail" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Your work has been auto-saved')).toBeInTheDocument();
  });

  it('recovers on Retry click when error is transient', () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error('transient');
      return <div data-testid="recovered">Back!</div>;
    }

    render(
      <ErrorBoundary name="Test">
        <MaybeThrow />
      </ErrorBoundary>,
    );

    // Error state shown
    expect(screen.getByText('transient')).toBeInTheDocument();

    // Fix the component
    shouldThrow = false;

    // Click Retry
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // Should re-render children
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary name="Test" fallback={<div data-testid="custom">Custom fallback</div>}>
        <ThrowingComponent message="fail" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });
});
