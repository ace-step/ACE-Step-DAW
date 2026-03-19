import { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import {
  listProjects,
  loadProject,
  deleteProject,
  importProjectArchive,
  type ProjectSummary,
} from '../../services/projectStorage';
import { toastSuccess, toastError } from '../../hooks/useToast';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { filterRecentProjects } from '../../utils/startupDialogUtils';
import type { ClipLayoutItem } from '../../utils/clipLayout';

function ProjectThumbnail({
  trackCount,
  clipLayout,
}: {
  trackCount: number;
  clipLayout?: ClipLayoutItem[];
}) {
  const fallbackColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

  if (clipLayout && clipLayout.length > 0) {
    const maxTrackIdx = Math.max(...clipLayout.map((c) => c.trackIndex));
    const laneCount = Math.min(maxTrackIdx + 1, 6);
    const laneHeight = Math.max(2, Math.floor(56 / laneCount));

    return (
      <div
        data-testid="project-thumbnail"
        className="w-full h-20 bg-daw-bg rounded-lg border border-daw-border/50 overflow-hidden relative"
      >
        {clipLayout.map((clip, i) => (
          <div
            key={i}
            className="absolute rounded-sm opacity-70"
            style={{
              backgroundColor: clip.color,
              top: `${(clip.trackIndex / laneCount) * 100}%`,
              left: `${clip.startNorm * 100}%`,
              width: `${Math.max(clip.widthNorm * 100, 2)}%`,
              height: `${laneHeight}px`,
            }}
          />
        ))}
      </div>
    );
  }

  const lanes = Math.min(trackCount, 6);
  return (
    <div
      data-testid="project-thumbnail"
      className="w-full h-20 bg-daw-bg rounded-lg border border-daw-border/50 overflow-hidden flex flex-col justify-center gap-0.5 p-2"
    >
      {Array.from({ length: lanes }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm opacity-60"
          style={{
            backgroundColor: fallbackColors[i % fallbackColors.length],
            height: `${Math.max(2, 14 / lanes)}px`,
            width: `${40 + ((i * 17) % 50)}%`,
          }}
        />
      ))}
      {trackCount === 0 && (
        <div className="text-[10px] text-zinc-600 text-center">Empty</div>
      )}
    </div>
  );
}

export function StartupDialog() {
  const show = useUIStore((s) => s.showStartupDialog);
  const setShow = useUIStore((s) => s.setShowStartupDialog);
  const setShowNewProjectDialog = useUIStore((s) => s.setShowNewProjectDialog);
  const setProject = useProjectStore((s) => s.setProject);

  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (show) {
      setSearchQuery('');
      setLoading(true);
      listProjects().then((list) => {
        setRecentProjects(list);
        setLoading(false);
      });
    }
  }, [show]);

  const filteredProjects = useMemo(
    () => filterRecentProjects(recentProjects, searchQuery),
    [recentProjects, searchQuery],
  );

  if (!show) return null;

  const handleOpenRecent = async (id: string) => {
    const project = await loadProject(id);
    if (project) {
      setProject(project);
      toastSuccess('Project loaded');
      setShow(false);
    }
  };

  const handleDeleteRecent = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
    setRecentProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleNewProject = () => {
    setShow(false);
    setShowNewProjectDialog(true);
  };

  const handleImport = async () => {
    const project = await importProjectArchive();
    if (project) {
      setProject(project);
      toastSuccess(`Imported "${project.name}"`);
      setShow(false);
    } else {
      toastError('Import failed or cancelled');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[680px] max-h-[85vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-daw-border">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Welcome Back</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Pick up where you left off or start something new
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 pt-4 pb-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            data-testid="startup-search"
          />
        </div>

        {/* Recent Projects Grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <div className="text-center py-8 text-zinc-500 text-xs">Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-500 text-xs">
                {searchQuery ? 'No projects match your search' : 'No recent projects'}
              </p>
            </div>
          ) : (
            <>
              <h3 className="text-xs font-medium text-zinc-400 mb-3">
                Recent Projects ({filteredProjects.length})
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {filteredProjects.map((p) => (
                  <div
                    key={p.id}
                    data-project-id={p.id}
                    className="relative text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2.5 group cursor-pointer"
                    onClick={() => handleOpenRecent(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleOpenRecent(p.id)}
                  >
                    <ProjectThumbnail trackCount={p.trackCount} clipLayout={p.clipLayout} />
                    <p className="text-xs text-zinc-200 truncate mt-2 group-hover:text-white font-medium">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {p.trackCount} track{p.trackCount !== 1 ? 's' : ''}
                      {' · '}{p.bpm} BPM · {p.keyScale}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {formatRelativeTime(p.updatedAt)}
                    </p>
                    <button
                      onClick={(e) => handleDeleteRecent(e, p.id)}
                      className="absolute top-1.5 right-1.5 text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      title="Remove project"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-daw-border">
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Import .acedaw
          </button>
          <button
            onClick={handleNewProject}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
            data-testid="startup-new-project"
          >
            New Project
          </button>
        </div>
      </div>
    </div>
  );
}
