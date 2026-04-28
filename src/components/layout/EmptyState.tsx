import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import {
  listProjects,
  loadProject,
  type ProjectSummary,
} from '../../services/projectStorage';
import {
  ONBOARDING_STARTERS,
  getStarterTemplate,
  instantiateDemoProject,
} from '../../data/onboardingCatalog';
import { toastSuccess, toastError } from '../../hooks/useToast';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

export function EmptyState() {
  const setProject = useProjectStore((s) => s.setProject);
  const createProject = useProjectStore((s) => s.createProject);
  const createProjectFromTemplate = useProjectStore((s) => s.createProjectFromTemplate);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);

  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    let isMounted = true;
    listProjects()
      .then((list) => {
        if (isMounted) setRecentProjects(list.slice(0, 4));
      })
      .catch(() => {
        // Ignore storage load failures in the empty state.
      });
    return () => { isMounted = false; };
  }, []);

  const handleOpenRecent = async (id: string) => {
    try {
      const project = await loadProject(id);
      if (project) {
        setProject(project);
        toastSuccess('Project loaded');
      }
    } catch {
      toastError('Failed to load project');
    }
  };

  const handleSelectStarter = (starter: (typeof ONBOARDING_STARTERS)[number]) => {
    if (starter.kind === 'template') {
      const tmpl = getStarterTemplate(starter.id);
      if (tmpl) createProjectFromTemplate(tmpl);
    } else {
      setProject(instantiateDemoProject(starter.id));
    }
    toastSuccess(`Opened "${starter.title}"`);
  };

  const templates = ONBOARDING_STARTERS.filter((s) => s.kind === 'template').slice(0, 4);
  const demos = ONBOARDING_STARTERS.filter((s) => s.kind === 'demo');

  return (
    <div
      data-testid="empty-state"
      className="flex-1 flex items-center justify-center"
    >
      <div className="w-[560px] max-h-[70vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">ACE-Step DAW</h2>
          <p className="text-[11px] text-zinc-500 mt-1">
            Create a new project or open a recent one
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 justify-center mb-6">
          <button
            onClick={() => createProject()}
            className="px-4 py-2 rounded-md bg-daw-accent hover:bg-daw-accent/90 text-white text-xs font-medium transition-colors"
          >
            New Project
          </button>
          <button
            onClick={() => setShowNewProjectDialog(true)}
            className="px-4 py-2 rounded-md bg-daw-surface-2 hover:bg-daw-hover text-zinc-300 text-xs font-medium transition-colors border border-daw-border"
          >
            Browse All
          </button>
        </div>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <div className="mb-5">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">
              Recent Projects
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {recentProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleOpenRecent(p.id)}
                  className="text-left rounded border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2.5"
                >
                  <p className="text-xs text-zinc-200 truncate font-medium">{p.name}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {p.trackCount} track{p.trackCount !== 1 ? 's' : ''} · <span className="font-mono">{p.bpm}</span> BPM
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {formatRelativeTime(p.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Templates */}
        <div className="mb-5">
          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">
            Quick Start Templates
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((starter) => (
              <button
                key={starter.id}
                onClick={() => handleSelectStarter(starter)}
                className="text-left rounded border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2.5"
              >
                <p className="text-xs text-zinc-200 font-medium">{starter.title}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  <span className="font-mono">{starter.bpm}</span> BPM · {starter.keyScale}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {starter.tracks.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-[9px] rounded bg-white/5 border border-white/10 px-1 py-0.5 text-zinc-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Demo projects */}
        {demos.length > 0 && (
          <div>
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">
              Demo Projects
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {demos.map((starter) => (
                <button
                  key={starter.id}
                  onClick={() => handleSelectStarter(starter)}
                  className="text-left rounded border border-violet-400/20 hover:border-violet-400/40 hover:bg-daw-surface-2 transition-colors p-2.5"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                      Demo
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 font-medium">{starter.title}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">
                    {starter.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
