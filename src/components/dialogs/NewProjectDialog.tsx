import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { KEY_SCALES, TIME_SIGNATURES } from '../../constants/tracks';
import {
  DEFAULT_BPM,
  DEFAULT_KEY_SCALE,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_PROJECT_NAME,
  MIN_BPM,
  MAX_BPM,
} from '../../constants/defaults';
import {
  listProjects,
  loadProject,
  deleteProject,
  listTemplates,
  loadTemplate,
  deleteTemplate,
  type ProjectSummary,
  type TemplateSummary,
} from '../../services/projectStorage';
import { ONBOARDING_STARTERS, getStarterTemplate, instantiateDemoProject } from '../../data/onboardingCatalog';
import { toastSuccess } from '../../hooks/useToast';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
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
    const laneHeight = Math.max(2, Math.floor(48 / laneCount));

    return (
      <div
        data-testid="project-thumbnail"
        className="w-full h-16 bg-daw-bg rounded border border-daw-border/50 overflow-hidden relative"
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
      className="w-full h-16 bg-daw-bg rounded border border-daw-border/50 overflow-hidden flex flex-col justify-center gap-0.5 p-1.5"
    >
      {Array.from({ length: lanes }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm opacity-60"
          style={{
            backgroundColor: fallbackColors[i % fallbackColors.length],
            height: `${Math.max(2, 12 / lanes)}px`,
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

export function NewProjectDialog() {
  const show = useUIStore((s) => s.showNewProjectDialog);
  const setShow = useUIStore((s) => s.setShowNewProjectDialog);
  const createProject = useProjectStore((s) => s.createProject);
  const setProject = useProjectStore((s) => s.setProject);
  const createProjectFromTemplate = useProjectStore((s) => s.createProjectFromTemplate);

  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM));
  const [keyScale, setKeyScale] = useState(DEFAULT_KEY_SCALE);
  const [timeSignature, setTimeSignature] = useState(DEFAULT_TIME_SIGNATURE);

  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  // Reset form and load recent projects + templates when dialog opens
  useEffect(() => {
    if (show) {
      setName(DEFAULT_PROJECT_NAME);
      setBpm(DEFAULT_BPM);
      setBpmText(String(DEFAULT_BPM));
      setKeyScale(DEFAULT_KEY_SCALE);
      setTimeSignature(DEFAULT_TIME_SIGNATURE);
      listProjects().then((list) => setRecentProjects(list));
      listTemplates().then((list) => setTemplates(list));
    }
  }, [show]);

  if (!show) return null;

  const handleCreate = () => {
    createProject({ name, bpm, keyScale, timeSignature });
    setShow(false);
  };

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

  const handleUseTemplate = async (templateId: string) => {
    const template = await loadTemplate(templateId);
    if (template) {
      createProjectFromTemplate(template);
      toastSuccess(`Project created from template "${template.name}"`);
      setShow(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await deleteTemplate(templateId);
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[600px] max-h-[80vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">New Project</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Recent Projects ── */}
          {recentProjects.length > 0 && (
            <div className="p-4 border-b border-daw-border">
              <h3 className="text-xs font-medium text-zinc-400 mb-3">Recent Projects</h3>
              <div className="grid grid-cols-3 gap-2">
                {recentProjects.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    data-project-id={p.id}
                    className="relative text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2 group cursor-pointer"
                    onClick={() => handleOpenRecent(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleOpenRecent(p.id)}
                  >
                    <ProjectThumbnail trackCount={p.trackCount} clipLayout={p.clipLayout} />
                    <p className="text-xs text-zinc-200 truncate mt-1.5 group-hover:text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {p.trackCount} track{p.trackCount !== 1 ? 's' : ''}
                      {' · '}{p.bpm} BPM · {p.keyScale}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {formatRelativeTime(p.updatedAt)}
                    </p>
                    <button
                      onClick={(e) => handleDeleteRecent(e, p.id)}
                      className="absolute top-1 right-1 text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      title="Remove from recent"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Starter Templates ── */}
          <div className="p-4 border-b border-daw-border">
            <h3 className="text-xs font-medium text-zinc-400 mb-3">Starter Templates</h3>
            <div className="grid grid-cols-3 gap-2">
              {ONBOARDING_STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  data-starter-id={starter.id}
                  onClick={() => {
                    if (starter.kind === 'template') {
                      const tmpl = getStarterTemplate(starter.id);
                      if (tmpl) createProjectFromTemplate(tmpl);
                    } else {
                      setProject(instantiateDemoProject(starter.id));
                    }
                    toastSuccess(`Opened "${starter.title}"`);
                    setShow(false);
                  }}
                  className="text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">{starter.kind === 'template' ? 'Template' : 'Demo'}</p>
                    <p className="text-[10px] text-zinc-500">{starter.bpm} BPM</p>
                  </div>
                  <p className="text-xs text-zinc-200 font-medium">{starter.title}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{starter.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {starter.tracks.slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-zinc-400">{t}</span>
                    ))}
                    {starter.tracks.length > 3 && (
                      <span className="text-[9px] text-zinc-500">+{starter.tracks.length - 3}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Templates ── */}
          {templates.length > 0 && (
            <div className="p-4 border-b border-daw-border">
              <h3 className="text-xs font-medium text-zinc-400 mb-3">Templates</h3>
              <div className="grid grid-cols-3 gap-2">
                {templates.slice(0, 6).map((t) => (
                  <div
                    key={t.id}
                    data-template-id={t.id}
                    className="relative text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2 group"
                  >
                    <button
                      onClick={() => handleUseTemplate(t.id)}
                      className="w-full text-left"
                    >
                      <ProjectThumbnail trackCount={t.trackCount} />
                      <p className="text-xs text-zinc-200 truncate mt-1.5 group-hover:text-white">
                        {t.name}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {t.trackCount} track{t.trackCount !== 1 ? 's' : ''}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="absolute top-1 right-1 text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                      title="Delete template"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── New Project Form ── */}
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">BPM</label>
              <input
                type="number"
                value={bpmText}
                onChange={(e) => setBpmText(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(bpmText);
                  const valid = isNaN(parsed) ? DEFAULT_BPM : Math.min(MAX_BPM, Math.max(MIN_BPM, parsed));
                  setBpm(valid);
                  setBpmText(String(valid));
                }}
                min={MIN_BPM}
                max={MAX_BPM}
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Key</label>
                <select
                  value={keyScale}
                  onChange={(e) => setKeyScale(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                >
                  {KEY_SCALES.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Time Signature</label>
                <select
                  value={timeSignature}
                  onChange={(e) => setTimeSignature(parseInt(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                >
                  {TIME_SIGNATURES.map((ts) => (
                    <option key={ts} value={ts}>{ts}/4</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400">
              Duration is determined automatically by your clips. Individual clips can override BPM, key, and time signature.
            </p>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <Button variant="default" size="md" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleCreate}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
