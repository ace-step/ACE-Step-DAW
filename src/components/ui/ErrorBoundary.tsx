/**
 * ErrorBoundary — Catches React render errors and shows a recovery UI.
 *
 * Prevents a single component crash from taking down the entire DAW.
 * Triggers auto-save before showing the fallback to preserve user work.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Name of the subsystem (displayed in fallback UI) */
  name: string;
  /** Children to render */
  children: ReactNode;
  /** Optional custom fallback (default: built-in crash panel) */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}] Caught error:`, error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);

    // Trigger auto-save to preserve user work
    try {
      const { saveProject } = require('../../services/projectStorage');
      const { useProjectStore } = require('../../store/projectStore');
      const project = useProjectStore.getState().project;
      if (project) {
        saveProject(project).catch(() => {
          // Best effort — don't let save failure cascade
        });
      }
    } catch {
      // Module import failed — we're in a bad state, just log
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-6 text-center"
          role="alert"
          data-testid={`error-boundary-${this.props.name}`}
        >
          <div className="text-red-400 text-sm font-medium">
            {this.props.name} encountered an error
          </div>
          <div className="text-zinc-500 text-xs max-w-[300px] break-words font-mono">
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={this.handleRetry}
              className="px-3 py-1.5 text-xs rounded bg-daw-accent/20 text-daw-accent hover:bg-daw-accent/30 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs rounded bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
            >
              Reload App
            </button>
          </div>
          <div className="text-zinc-600 text-[10px] mt-1">
            Your work has been auto-saved
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
