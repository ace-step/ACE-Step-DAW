import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroovePoolPanel } from '../GroovePoolPanel';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { FACTORY_GROOVES } from '../../../data/factoryGrooves';
import type { GrooveTemplate } from '../../../types/project';

function makeUserGroove(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
  return {
    id: 'user-groove-1',
    name: 'My Custom Groove',
    timingOffsets: [0, 0.05, 0, 0.05],
    velocityPattern: [1.2, 0.8, 1.1, 0.9],
    gridBeats: 0.5,
    lengthBeats: 2,
    createdAt: Date.now(),
    ...overrides,
  };
}

function setupProject(grooves: GrooveTemplate[] = []) {
  // Create a project first, then add grooves
  useProjectStore.getState().createProject();
  if (grooves.length > 0) {
    const state = useProjectStore.getState();
    useProjectStore.setState({
      project: { ...state.project!, groovePool: grooves },
    });
  }
}

describe('GroovePoolPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('renders nothing when showGroovePoolPanel is false', () => {
    const { container } = render(<GroovePoolPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the panel when showGroovePoolPanel is true', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    expect(screen.getByText('Groove Pool')).toBeDefined();
  });

  it('shows factory grooves', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    expect(screen.getByText(FACTORY_GROOVES[0].name)).toBeDefined();
  });

  it('shows user grooves from project.groovePool', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    setupProject([makeUserGroove()]);
    render(<GroovePoolPanel />);
    expect(screen.getByText('My Custom Groove')).toBeDefined();
  });

  it('closes when close button is clicked', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const closeBtn = screen.getByLabelText('Close groove pool panel');
    fireEvent.click(closeBtn);
    expect(useUIStore.getState().showGroovePoolPanel).toBe(false);
  });

  it('filters grooves by category tab', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const swingElements = screen.getAllByText('Swing');
    fireEvent.click(swingElements[0]);
    expect(screen.getByText('Light Swing 8th')).toBeDefined();
  });

  it('shows All tab as active by default', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const allTab = screen.getByText('All');
    expect(allTab.className).toContain('bg-daw-accent');
  });

  it('shows grid info for each groove', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const eighthElements = screen.getAllByText('8th');
    expect(eighthElements.length).toBeGreaterThan(0);
  });

  it('allows deleting user grooves', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    setupProject([makeUserGroove()]);
    render(<GroovePoolPanel />);
    const deleteBtn = screen.getByLabelText('Delete groove My Custom Groove');
    fireEvent.click(deleteBtn);
    expect(useProjectStore.getState().project?.groovePool ?? []).toHaveLength(0);
  });

  it('displays empty state when Custom tab is selected and no custom grooves exist', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const tabs = screen.getAllByText('Custom');
    fireEvent.click(tabs[0]);
    expect(screen.getByText(/No grooves/)).toBeDefined();
  });

  it('shows Factory badge on factory grooves', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const badges = screen.getAllByText('Factory');
    expect(badges.length).toBe(FACTORY_GROOVES.length);
  });

  it('does not show delete button on factory grooves', () => {
    useUIStore.setState({ showGroovePoolPanel: true });
    render(<GroovePoolPanel />);
    const deleteButtons = screen.queryAllByLabelText(/Delete groove/);
    expect(deleteButtons).toHaveLength(0);
  });
});
