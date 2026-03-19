import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useShortcutsStore } from '../../store/shortcutsStore';
import { KEY_SCALES, TIME_SIGNATURES } from '../../constants/tracks';
import { SHORTCUT_PRESETS } from '../../constants/shortcutPresets';
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
  listTemplates,
  loadTemplate,
  deleteTemplate,
  type ProjectSummary,
  type TemplateSummary,
} from '../../services/projectStorage';
import { toastSuccess } from '../../hooks/useToast';

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ProjectThumbnail({ trackCount }: { trackCount: number }) {
  const lanes = Math.min(trackCount, 6);
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
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
            backgroundColor: colors[i % colors.length],
            height: `${Math.max(2, 12 / lanes)}px`,
            width: `${40 + ((i * 17) % 50)}%`,
          }}
        />
      ))}
      {trackCount === 0 && (
        <div className="text-[9px] text-zinc-600 text-center">Empty</div>
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
  const activeShortcutPresetId = useShortcutsStore((s) => s.activePresetId);
  const applyShortcutPreset = useShortcutsStore((s) => s.applyPreset);
  const resetShortcuts = useShortcutsStore((s) => s.resetAll);

  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM));
  const [keyScale, setKeyScale] = useState(DEFAULT_KEY_SCALE);
  const [timeSignature, setTimeSignature] = useState(DEFAULT_TIME_SIGNATURE);
  const [shortcutPresetId, setShortcutPresetId] = useState('ace-step');

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
      setShortcutPresetId(activeShortcutPresetId === 'custom' ? 'ace-step' : activeShortcutPresetId);
      listProjects().then((list) => setRecentProjects(list));
      listTemplates().then((list) => setTemplates(list));
    }
  }, [activeShortcutPresetId, show]);

  if (!show) return null;

  const handleCreate = () => {
    if (shortcutPresetId === 'ace-step') {
      resetShortcuts();
    } else {
      applyShortcutPreset(shortcutPresetId);
    }
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
      <div className={`${recentProjects.length > 0 || templates.length > 0 ? 'w-[600px]' : 'w-[400px]'} max-h-[80vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">New Project</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
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
                  <button
                    key={p.id}
                    data-project-id={p.id}
                    onClick={() => handleOpenRecent(p.id)}
                    className="text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2 group"
                  >
                    <ProjectThumbnail trackCount={p.trackCount} />
                    <p className="text-xs text-zinc-200 truncate mt-1.5 group-hover:text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {p.trackCount} track{p.trackCount !== 1 ? 's' : ''} &middot; {formatDate(p.updatedAt)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

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
                      <p className="text-[10px] text-zinc-500 truncate">
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

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Shortcut Migration Preset</label>
              <select
                value={shortcutPresetId}
                onChange={(e) => setShortcutPresetId(e.target.value)}
                aria-label="Shortcut migration preset"
                className="w-full px-3 py-1.5 text-sm bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              >
                {SHORTCUT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-500">
                Choose the closest DAW muscle-memory map now, then fine-tune it later in Settings → Shortcut Editor.
              </p>
            </div>

            <p className="text-[10px] text-zinc-500">
              Duration is determined automatically by your clips. Individual clips can override BPM, key, and time signature.
            </p>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
