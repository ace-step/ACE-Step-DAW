import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SharedProjectPage } from '../sharing/SharedProjectPage';
import { useShareLink } from '../../hooks/useShareLink';

const EditorShell = lazy(() => import('./EditorShell').then(m => ({ default: m.EditorShell })));

export function AppShell() {
  const shareLinkState = useShareLink() ?? { sharedProject: null, loadingSharedProject: false };
  const { sharedProject, loadingSharedProject } = shareLinkState;

  if (loadingSharedProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-daw-bg text-zinc-200">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-6">
          <svg className="w-5 h-5 animate-spin text-daw-accent" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-zinc-300">Loading shared stem player...</span>
        </div>
      </div>
    );
  }

  if (sharedProject) {
    return <SharedProjectPage sharedProject={sharedProject} />;
  }

  return (
    <ErrorBoundary name="DAW">
      <Suspense fallback={null}>
        <EditorShell />
      </Suspense>
    </ErrorBoundary>
  );
}
