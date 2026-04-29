import { useState, useEffect, useMemo } from 'react';
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
import {
  listVersionMetadata,
  loadVersion,
  deleteVersion,
  deleteAllVersions,
  saveVersion,
  type VersionMetadata,
  type VersionSnapshot,
} from '../../services/versionHistory';
import {
  listProjectMetas,
  deleteProjectMeta,
  toggleFavorite,
  setProjectFolder,
  addProjectTag,
  removeProjectTag,
  searchProjects,
  type ProjectMeta,
  type ProjectSearchFilter,
} from '../../services/projectOrganization';
import { exportProjectToMidi } from '../../services/midiFile';

type DialogTab = 'projects' | 'versions';

function createDefaultProjectMeta(projectId: string): ProjectMeta {
  return {
    projectId,
    folder: null,
    tags: [],
    isFavorite: false,
    color: null,
    notes: '',
  };
}

function getVersionMetadata(snapshot: VersionSnapshot): VersionMetadata {
  const { project: _project, ...metadata } = snapshot;
  return metadata;
}

// ── Version History Panel ──

function VersionHistoryPanel({
  projectId,
  onRestore,
}: {
  projectId: string | null;
  onRestore: (project: Project) => void;
}) {
  const [versions, setVersions] = useState<VersionMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setVersions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listVersionMetadata(projectId)
      .then((v) => {
        if (!cancelled) {
          setVersions(v);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toastError('Failed to load versions');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleRestore = async (v: VersionMetadata) => {
    try {
      const full = await loadVersion(v.projectId, v.id);
      if (full?.project) {
        onRestore(full.project);
        toastSuccess(`Restored version from ${formatDateTime(v.savedAt)}`);
      }
    } catch {
      toastError('Failed to restore version');
    }
  };

  const handleDelete = async (v: VersionMetadata) => {
    try {
      await deleteVersion(v.projectId, v.id);
      setVersions((prev) => prev.filter((x) => x.id !== v.id));
    } catch {
      toastError('Failed to delete version');
    }
  };

  const handleSaveNow = async () => {
    if (!projectId) return;
    const project = useProjectStore.getState().project;
    if (!project) return;
    try {
      const snapshot = await saveVersion(project, 'Manual save', 'manual');
      setVersions((prev) => [getVersionMetadata(snapshot), ...prev]);
      toastSuccess('Version saved');
    } catch {
      toastError('Failed to save version');
    }
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-zinc-500">
        No project open
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-zinc-400">{versions.length} version{versions.length !== 1 ? 's' : ''}</p>
        <button
          onClick={handleSaveNow}
          className="px-2 py-1 text-[10px] font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
        >
          Save Version Now
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-zinc-400 text-center py-8">Loading...</p>
      ) : versions.length === 0 ? (
        <p className="text-xs text-zinc-400 text-center py-8">
          No versions yet. Versions are saved automatically every 5 minutes.
        </p>
      ) : (
        <div className="space-y-1">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 px-3 py-2 rounded hover:bg-daw-surface-2 border border-transparent"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{v.label}</p>
                <p className="text-[10px] text-zinc-400">
                  {formatDateTime(v.savedAt)} &middot; {v.trackCount} track{v.trackCount !== 1 ? 's' : ''} &middot; {v.bpm} BPM
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleRestore(v)}
                  className="px-2 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(v)}
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
  );
}

// ── Project Meta Row (favorite, tags, folder) ──

function ProjectMetaRow({
  projectId,
  meta,
  onUpdate,
}: {
  projectId: string;
  meta: ProjectMeta;
  onUpdate: (m: ProjectMeta) => void;
}) {
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderInput, setFolderInput] = useState('');

  const handleToggleFav = async () => {
    try {
      const updated = await toggleFavorite(projectId);
      onUpdate(updated);
    } catch {
      toastError('Failed to update favorite');
    }
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim();
    if (!tag) return;
    try {
      const updated = await addProjectTag(projectId, tag);
      onUpdate(updated);
      setTagInput('');
      setShowTagInput(false);
    } catch {
      toastError('Failed to add tag');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      const updated = await removeProjectTag(projectId, tag);
      onUpdate(updated);
    } catch {
      toastError('Failed to remove tag');
    }
  };

  const handleSetFolder = async () => {
    const folder = folderInput.trim() || null;
    try {
      const updated = await setProjectFolder(projectId, folder);
      onUpdate(updated);
      setShowFolderInput(false);
      setFolderInput('');
    } catch {
      toastError('Failed to set folder');
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <button
        onClick={handleToggleFav}
        className={`text-[10px] transition-colors ${meta.isFavorite ? 'text-yellow-400' : 'text-zinc-500 hover:text-zinc-400'}`}
        title={meta.isFavorite ? 'Remove favorite' : 'Add favorite'}
      >
        {meta.isFavorite ? '\u2605' : '\u2606'}
      </button>
      {meta.folder && (
        <span className="text-[9px] px-1.5 py-0.5 bg-daw-surface-2 rounded text-zinc-400">
          {meta.folder}
        </span>
      )}
      {meta.tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-daw-accent/20 rounded text-daw-accent">
          {tag}
          <button onClick={() => handleRemoveTag(tag)} className="text-daw-accent/60 hover:text-daw-accent ml-0.5">&times;</button>
        </span>
      ))}
      {!showTagInput && !showFolderInput && (
        <div className="flex gap-1">
          <button
            onClick={() => setShowTagInput(true)}
            className="text-[9px] text-zinc-500 hover:text-zinc-400 transition-colors"
            title="Add tag"
          >
            +tag
          </button>
          <button
            onClick={() => { setShowFolderInput(true); setFolderInput(meta.folder ?? ''); }}
            className="text-[9px] text-zinc-500 hover:text-zinc-400 transition-colors"
            title="Set folder"
          >
            +folder
          </button>
        </div>
      )}
      {showTagInput && (
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') setShowTagInput(false); }}
          placeholder="tag..."
          className="w-16 px-1 py-0.5 text-[9px] bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
          autoFocus
        />
      )}
      {showFolderInput && (
        <input
          type="text"
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSetFolder(); if (e.key === 'Escape') setShowFolderInput(false); }}
          placeholder="folder name..."
          className="w-20 px-1 py-0.5 text-[9px] bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
          autoFocus
        />
      )}
    </div>
  );
}

// ── Helpers ──

function formatDateTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectListDialog() {
  const show = useUIStore((s) => s.showProjectListDialog);
  const setShow = useUIStore((s) => s.setShowProjectListDialog);
  const currentProject = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const saveProjectAsTemplate = useProjectStore((s) => s.saveProjectAsTemplate);
  const createProject = useProjectStore((s) => s.createProject);
  const importStoreMidiFile = useProjectStore((s) => s.importMidiFile);

  const [tab, setTab] = useState<DialogTab>('projects');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectMetas, setProjectMetas] = useState<Map<string, ProjectMeta>>(new Map());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showTemplateName, setShowTemplateName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFolder, setFilterFolder] = useState<string | null>(null);
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);

  useEffect(() => {
    if (show) {
      setLoading(true);
      setProjects([]);
      Promise.all([listProjects(), listProjectMetas()]).then(([list, metas]) => {
        setProjects(list);
        const metaMap = new Map<string, ProjectMeta>();
        for (const m of metas) metaMap.set(m.projectId, m);
        for (const project of list) {
          if (!metaMap.has(project.id)) {
            metaMap.set(project.id, createDefaultProjectMeta(project.id));
          }
        }
        setProjectMetas(metaMap);
      }).catch(() => {
        toastError('Failed to load projects');
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [show]);

  // Derive unique folders for filter dropdown
  const allFolders = useMemo(() => {
    const folders = new Set<string>();
    for (const m of projectMetas.values()) {
      if (m.folder) folders.add(m.folder);
    }
    return Array.from(folders).sort();
  }, [projectMetas]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Apply meta filters
    if (filterFolder || filterFavoritesOnly) {
      const filter: ProjectSearchFilter = {};
      if (filterFolder) filter.folder = filterFolder;
      if (filterFavoritesOnly) filter.favoritesOnly = true;
      const matchingMetas = searchProjects(Array.from(projectMetas.values()), filter);
      const matchingIds = new Set(matchingMetas.map((m) => m.projectId));
      result = result.filter((p) => matchingIds.has(p.id));
    }

    return result;
  }, [projects, searchQuery, filterFolder, filterFavoritesOnly, projectMetas]);

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
      await deleteProjectMeta(id);
      await deleteAllVersions(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setProjectMetas((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      // If deleting the current project, clear workspace
      if (id === currentProject?.id) {
        createProject();
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

  const handleMetaUpdate = (projectId: string, meta: ProjectMeta) => {
    setProjectMetas((prev) => {
      const next = new Map(prev);
      next.set(projectId, meta);
      return next;
    });
  };

  const handleExportMidi = () => {
    if (!currentProject) return;
    try {
      const bytes = exportProjectToMidi(currentProject);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name.replace(/[^a-zA-Z0-9\-_ ]/g, '')}.mid`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toastSuccess('MIDI file exported');
    } catch {
      toastError('Failed to export MIDI');
    }
  };

  const handleImportMidi = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mid,.midi';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        if (currentProject) {
          await saveProject(currentProject);
        } else {
          createProject({ name: file.name.replace(/\.(mid|midi)$/i, '') });
        }

        const trackIds = await importStoreMidiFile(file, { applyMetadata: true });
        if (trackIds.length > 0) {
          setShow(false);
        }
      } catch {
        toastError('Failed to import MIDI file');
      }
    };
    input.click();
  };

  const handleRestoreVersion = (project: Project) => {
    setProject(project);
    setTab('projects');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[580px] max-h-[75vh] bg-daw-surface rounded-lg border border-daw-border shadow-2xl flex flex-col">
        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-daw-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab('projects')}
              className={`text-xs font-medium pb-1 border-b-2 transition-colors ${
                tab === 'projects'
                  ? 'border-daw-accent text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setTab('versions')}
              className={`text-xs font-medium pb-1 border-b-2 transition-colors ${
                tab === 'versions'
                  ? 'border-daw-accent text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              Version History
            </button>
          </div>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Search & filter bar (projects tab only) */}
        {tab === 'projects' && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-daw-border bg-daw-surface-2/30">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="flex-1 px-2 py-1 text-xs bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            />
            <select
              value={filterFolder ?? ''}
              onChange={(e) => setFilterFolder(e.target.value || null)}
              className="px-2 py-1 text-xs bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent text-zinc-300"
            >
              <option value="">All folders</option>
              {allFolders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                filterFavoritesOnly
                  ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
                  : 'bg-daw-bg border-daw-border text-zinc-400 hover:text-zinc-300'
              }`}
              title="Show favorites only"
            >
              {filterFavoritesOnly ? '\u2605' : '\u2606'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'versions' ? (
            <VersionHistoryPanel
              projectId={currentProject?.id ?? null}
              onRestore={handleRestoreVersion}
            />
          ) : loading ? (
            <p className="text-xs text-zinc-400 text-center py-8">Loading...</p>
          ) : filteredProjects.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-8">
              {projects.length === 0
                ? 'No saved projects yet. Your current project is auto-saved.'
                : 'No projects match your filters.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredProjects.map((p) => {
                const meta = projectMetas.get(p.id) ?? createDefaultProjectMeta(p.id);
                return (
                  <div
                    key={p.id}
                    className={`px-3 py-2 rounded transition-colors ${
                      p.id === currentProject?.id
                        ? 'bg-daw-accent/20 border border-daw-accent/40'
                        : 'hover:bg-daw-surface-2 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-zinc-400">
                          {p.trackCount} track{p.trackCount !== 1 ? 's' : ''} &middot; {formatDateTime(p.updatedAt)} &middot; {p.bpm} BPM
                        </p>
                        <ProjectMetaRow
                          projectId={p.id}
                          meta={meta}
                          onUpdate={(m) => handleMetaUpdate(p.id, m)}
                        />
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
                  </div>
                );
              })}
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
          <div className="flex gap-2 flex-wrap">
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
              onClick={handleImportMidi}
              className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors"
            >
              Import .mid
            </button>
            <button
              onClick={handleExportMidi}
              disabled={!currentProject}
              className="px-3 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50"
            >
              Export .mid
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
