import type { Project } from '../types/project';

export interface CloudProject {
  cloudId: string;
  projectId: string;
  owner: string;
  version: number;
  savedAt: number;
  project: Project;
}

export interface CloudProjectSummary {
  cloudId: string;
  projectId: string;
  name: string;
  owner: string;
  version: number;
  savedAt: number;
  trackCount: number;
}

export interface CloudVersionEntry {
  version: number;
  savedAt: number;
  cloudId: string;
}

let _store = new Map<string, CloudProject>();
let _versionHistory = new Map<string, CloudVersionEntry[]>();

function generateCloudId(projectId: string, version: number): string {
  return `cloud_${projectId}_v${version}_${Date.now().toString(36)}`;
}

export const cloudStorage = {
  async save(project: Project, owner: string): Promise<CloudProject> {
    const existing = _store.get(project.id);
    const version = existing ? existing.version + 1 : 1;
    const now = Date.now();
    const cloudId = generateCloudId(project.id, version);
    const record: CloudProject = {
      cloudId, projectId: project.id, owner, version, savedAt: now,
      project: structuredClone(project),
    };
    _store.set(project.id, record);
    const history = _versionHistory.get(project.id) ?? [];
    history.push({ version, savedAt: now, cloudId });
    _versionHistory.set(project.id, history);
    return record;
  },
  async load(projectId: string): Promise<CloudProject | null> {
    return _store.get(projectId) ?? null;
  },
  async list(): Promise<CloudProjectSummary[]> {
    const summaries: CloudProjectSummary[] = [];
    for (const record of _store.values()) {
      summaries.push({
        cloudId: record.cloudId, projectId: record.projectId, name: record.project.name,
        owner: record.owner, version: record.version, savedAt: record.savedAt,
        trackCount: record.project.tracks.length,
      });
    }
    return summaries.sort((a, b) => {
      const aTime = _store.get(a.projectId)?.project.updatedAt ?? a.savedAt;
      const bTime = _store.get(b.projectId)?.project.updatedAt ?? b.savedAt;
      return bTime - aTime;
    });
  },
  async delete(projectId: string): Promise<boolean> {
    const existed = _store.has(projectId);
    _store.delete(projectId);
    _versionHistory.delete(projectId);
    return existed;
  },
  async getVersionHistory(projectId: string): Promise<CloudVersionEntry[]> {
    return _versionHistory.get(projectId) ?? [];
  },
};

export function resetCloudStorage(): void {
  _store = new Map();
  _versionHistory = new Map();
}
