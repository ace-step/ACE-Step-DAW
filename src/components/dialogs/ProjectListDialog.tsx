import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import type { Project } from '../../types/project';
import {
  listProjects,
  loadProject,
  deleteProject,
  saveProject,
  exportProjectArchive,
  importProjectArchive,
  saveTemplate,
  type ProjectSummary,
} from '../../services/projectStorage';
import { deleteAllProjectAudio } from '../../services/audioFileManager';
import { toastSuccess, toastError } from '../../hooks/useToast';

export function ProjectListDialog() {
  const show = useUIStore((s) => s.showProjectListDialog);
  const setShow = useUIStore((s) => s.setShowProjectListDialog);
  const currentProject = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const saveProjectAsTemplate = useProjectStore((s) => s.saveProjectAsTemplate);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showTemplateName, setShowTemplateName] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (show) {
      setLoading(true);
      setProjects([]);
      listProjects().then((list) => {
        setProjects(list);
      }).catch(() => {
        toastError('Failed to load projects');
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [show]);

  if (!show) return null;

  const handleOpen = async (id: string) => {
    try {
      // Save current project first
      if (currentProject) {
        await saveProject(currentProject);
      }
      const project = await loadProject(id);
      if (project) {
        setProject(project);
        toastSuccess('Project loaded');
        setShow(false);
      }
    } catch {
      toastError('Failed to load project');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteProject(id);
      await deleteAllProjectAudio(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // If deleting the current project, clear workspace
      if (id === currentProject?.id) {
        setProject(null as unknown as Project);
        setShow(false);
      }
    } catch {
      toastError('Failed to delete project');
    }
  };

  const handleExport = async () => {
    if (!currentProject) return;
    setExporting(true);
    try {
      await exportProjectArchive(currentProject);
    } catch {
      toastError('Failed to export project');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!currentProject || !templateName.trim()) return;
    try {
      const template = saveProjectAsTemplate(templateName);
      await saveTemplate(template);
      toastSuccess(`Template "${template.name}" saved`);
      setShowTemplateName(false);
      setTemplateName('');
    } catch {
      toastError('Failed to save template');
    }
  };

  const handleImport = async () => {
    try {
      const project = await importProjectArchive();
      if (project) {
        if (currentProject) {
          await saveProject(currentProject);
        }
        setProject(project);
        toastSuccess('Project loaded');
        setShow(false);
      }
    } catch {
      toastError('Failed to import project');
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] max-h-[70vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Projects</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-xs text-zinc-400 text-center py-8">Loading...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">
              No saved projects yet. Your current project is auto-saved.
            </p>
          ) : (
            <div className="space-y-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                    p.id === currentProject?.id
                      ? 'bg-daw-accent/20 border border-daw-accent/40'
                      : 'hover:bg-daw-surface-2 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{p.name}</p>
                    <p className="text-[10px] text-zinc-400">
                      {p.trackCount} track{p.trackCount !== 1 ? 's' : ''} &middot; {formatDate(p.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.id === currentProject?.id ? (
                      <span className="text-[10px] text-daw-accent font-medium mr-1">Current</span>
                    ) : (
                      <button
                        onClick={() => handleOpen(p.id)}
                        className="px-2 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
                      >
                        Open
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showTemplateName && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-daw-border bg-daw-surface-2/50">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsTemplate(); if (e.key === 'Escape') setShowTemplateName(false); }}
              placeholder="Template name..."
              className="flex-1 px-2 py-1 text-xs bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              autoFocus
            />
            <button
              onClick={handleSaveAsTemplate}
              disabled={!templateName.trim()}
              className="px-2 py-1 text-[10px] font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setShowTemplateName(false)}
              className="px-2 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-daw-border">
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
            >
              Import .acedaw
            </button>
            <button
              onClick={handleExport}
              disabled={!currentProject || exporting}
              className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50"
            >
              {exporting ? 'Packing...' : 'Export .acedaw'}
            </button>
            <button
              onClick={() => { setShowTemplateName(true); setTemplateName(currentProject?.name ?? ''); }}
              disabled={!currentProject}
              className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50"
            >
              Save as Template
            </button>
          </div>
          <button
            onClick={() => setShow(false)}
            className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
