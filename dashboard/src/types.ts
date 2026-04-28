// Agent Dashboard — shared types between server and client

export interface AgentEntry {
  id: string;
  issue: number;
  tool: 'claude' | 'codex';
  pid: number;
  started: string;
  status: 'running' | 'stale';
  alive: boolean;
}

export interface PipelineItem {
  number: number;
  title: string;
  stage: 'open' | 'in_progress' | 'pr_open' | 'ci_running' | 'ci_failed' | 'ci_passed' | 'review' | 'merged';
  tool?: 'claude' | 'codex';
  prNumber?: number;
  labels: string[];
}

export interface ActivityEntry {
  timestamp: string;
  source: string;
  message: string;
  raw: string;
}

export interface PRStatus {
  number: number;
  title: string;
  branch: string;
  ciStatus: 'pending' | 'passing' | 'failing' | 'unknown';
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'none';
  createdAt: string;
  mergeable: boolean;
}

export interface DashboardSnapshot {
  timestamp: number;
  agents: AgentEntry[];
  capacity: {
    claude: { running: number; max: number };
    codex: { running: number; max: number };
  };
  pipeline: PipelineItem[];
  activity: ActivityEntry[];
  prs: PRStatus[];
  metrics: {
    closedToday: number;
    mergedToday: number;
    openPRs: number;
    avgMergeHours: number | null;
  };
}
