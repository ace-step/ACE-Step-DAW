import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EffectCardLayout, ParamGroup } from '../EffectCardLayout';

describe('EffectCardLayout', () => {
  it('renders children in a grid', () => {
    render(
      <EffectCardLayout>
        <div data-testid="param1">Param 1</div>
        <div data-testid="param2">Param 2</div>
      </EffectCardLayout>,
    );
    expect(screen.getByTestId('param1')).toBeDefined();
    expect(screen.getByTestId('param2')).toBeDefined();
  });

  it('renders mode slot when provided', () => {
    render(
      <EffectCardLayout mode={<button>LP</button>}>
        <div>Params</div>
      </EffectCardLayout>,
    );
    expect(screen.getByRole('button', { name: 'LP' })).toBeDefined();
  });

  it('renders visualization slot when provided', () => {
    render(
      <EffectCardLayout visualization={<canvas data-testid="viz" />}>
        <div>Params</div>
      </EffectCardLayout>,
    );
    expect(screen.getByTestId('viz')).toBeDefined();
  });

  it('renders footer slot when provided', () => {
    render(
      <EffectCardLayout footer={<div data-testid="footer">Dry/Wet</div>}>
        <div>Params</div>
      </EffectCardLayout>,
    );
    expect(screen.getByTestId('footer')).toBeDefined();
  });

  it('does not render optional slots when not provided', () => {
    const { container } = render(
      <EffectCardLayout>
        <div>Params only</div>
      </EffectCardLayout>,
    );
    // Should only have the grid container, no mode/viz/footer wrappers
    const topLevel = container.firstElementChild!;
    // Only 1 child: the grid
    expect(topLevel.children.length).toBe(1);
  });
});

describe('ParamGroup', () => {
  it('renders label when provided', () => {
    render(
      <ParamGroup label="Envelope">
        <div>Attack</div>
      </ParamGroup>,
    );
    expect(screen.getByText('Envelope')).toBeDefined();
  });

  it('renders children without label', () => {
    render(
      <ParamGroup>
        <div data-testid="child">Knob</div>
      </ParamGroup>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
  });
});
