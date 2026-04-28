import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EffectCardLayout, ParamGroup, ModeButton } from '../../EffectCardLayout';

describe('EffectCardLayout', () => {
  it('renders children', () => {
    render(
      <EffectCardLayout>
        <span>Param1</span>
        <span>Param2</span>
      </EffectCardLayout>,
    );
    expect(screen.getByText('Param1')).toBeDefined();
    expect(screen.getByText('Param2')).toBeDefined();
  });

  it('renders mode section when provided', () => {
    render(
      <EffectCardLayout mode={<button>LP</button>}>
        <span>Content</span>
      </EffectCardLayout>,
    );
    expect(screen.getByText('LP')).toBeDefined();
  });

  it('renders visualization section when provided', () => {
    render(
      <EffectCardLayout visualization={<div data-testid="viz">Curve</div>}>
        <span>Content</span>
      </EffectCardLayout>,
    );
    expect(screen.getByTestId('viz')).toBeDefined();
  });

  it('renders footer section when provided', () => {
    render(
      <EffectCardLayout footer={<div>Footer Content</div>}>
        <span>Content</span>
      </EffectCardLayout>,
    );
    expect(screen.getByText('Footer Content')).toBeDefined();
  });

  it('omits mode, visualization, and footer when not provided', () => {
    const { container } = render(
      <EffectCardLayout>
        <span>Only Children</span>
      </EffectCardLayout>,
    );
    expect(screen.getByText('Only Children')).toBeDefined();
    // The inner flex column should have only 1 child (the children wrapper)
    // when mode, visualization, and footer are all omitted
    const innerColumn = container.querySelector('.flex.flex-col.items-center.gap-3');
    expect(innerColumn).not.toBeNull();
    expect(innerColumn!.childElementCount).toBe(1);
  });
});

describe('ParamGroup', () => {
  it('renders children', () => {
    render(<ParamGroup><span>Knob</span></ParamGroup>);
    expect(screen.getByText('Knob')).toBeDefined();
  });

  it('renders optional label', () => {
    render(<ParamGroup label="Dynamics"><span>Knob</span></ParamGroup>);
    expect(screen.getByText('Dynamics')).toBeDefined();
  });

  it('omits label when not provided', () => {
    const { container } = render(<ParamGroup><span>Knob</span></ParamGroup>);
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(1); // Only the Knob span
  });
});

describe('ModeButton', () => {
  it('renders children text', () => {
    render(<ModeButton active={false} onClick={() => {}}>LP</ModeButton>);
    expect(screen.getByText('LP')).toBeDefined();
  });

  it('sets aria-pressed when active', () => {
    render(<ModeButton active={true} onClick={() => {}}>LP</ModeButton>);
    expect(screen.getByText('LP').getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed false when inactive', () => {
    render(<ModeButton active={false} onClick={() => {}}>HP</ModeButton>);
    expect(screen.getByText('HP').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies color styling when active', () => {
    render(<ModeButton active={true} onClick={() => {}} color="#ff0000">LP</ModeButton>);
    const btn = screen.getByText('LP');
    expect(btn.style.backgroundColor).toBeTruthy();
  });

  it('supports custom aria-label', () => {
    render(<ModeButton active={false} onClick={() => {}} ariaLabel="Low Pass Filter">LP</ModeButton>);
    expect(screen.getByLabelText('Low Pass Filter')).toBeDefined();
  });
});
