import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, watch, access } from 'node:fs/promises';
import { join, extname, resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import type { DashboardSnapshot, AgentEntry, ActivityEntry, PRStatus, PipelineItem } from './src/types.js';

const execFileAsync = promisify(execFile);
const PORT = parseInt(process.env.DASHBOARD_PORT || '5175', 10);
const REPO = 'ace-step/ACE-Step-DAW';
const PM_DIR = join(process.cwd(), '.pm');
const REGISTRY_FILE = join(PM_DIR, 'agent-registry.json');
const ACTIVITY_LOG = join(PM_DIR, 'activity.log');
const MAX_CLAUDE = 3;
const MAX_CODEX = 10;

// ── Data Gathering ──

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function readRegistry(): Promise<AgentEntry[]> {
  if (!await fileExists(REGISTRY_FILE)) return [];
  try {
    const data = JSON.parse(await readFile(REGISTRY_FILE, 'utf-8'));
    return (data.agents || []).map((a: any) => ({ ...a, alive: true }));
  } catch { return []; }
}

async function readActivityLog(): Promise<ActivityEntry[]> {
  if (!await fileExists(ACTIVITY_LOG)) return [];
  try {
    const raw = await readFile(ACTIVITY_LOG, 'utf-8');
    const lines = raw.trim().split('\n').slice(-50);
    return lines.map(line => {
      const match = line.match(/^\[(.+?)\]\s*\[(.+?)\]\s*(.*)$/);
      if (match) return { timestamp: match[1], source: match[2], message: match[3], raw: line };
      return { timestamp: '', source: '', message: line, raw: line };
    });
  } catch { return []; }
}

async function ghJson<T>(args: string[]): Promise<T | null> {
  try {
    const { stdout } = await execFileAsync('gh', args, { timeout: 15000 });
    return JSON.parse(stdout);
  } catch { return null; }
}

async function queryPRs(): Promise<PRStatus[]> {
  const prs = await ghJson<any[]>([
    'pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '30',
    '--json', 'number,title,headRefName,createdAt,mergeable,statusCheckRollup,reviewDecision',
  ]);
  if (!prs) return [];
  return prs.map(pr => ({
    number: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    createdAt: pr.createdAt,
    mergeable: pr.mergeable === 'MERGEABLE',
    ciStatus: deriveCIStatus(pr.statusCheckRollup),
    reviewStatus: deriveReviewStatus(pr.reviewDecision),
  }));
}

function deriveCIStatus(checks: any[]): PRStatus['ciStatus'] {
  if (!checks || checks.length === 0) return 'unknown';
  if (checks.every((c: any) => c.conclusion === 'SUCCESS')) return 'passing';
  if (checks.some((c: any) => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR')) return 'failing';
  return 'pending';
}

function deriveReviewStatus(decision: string | null): PRStatus['reviewStatus'] {
  if (!decision) return 'none';
  if (decision === 'APPROVED') return 'approved';
  if (decision === 'CHANGES_REQUESTED') return 'changes_requested';
  return 'pending';
}

async function queryPipeline(agents: AgentEntry[], prs: PRStatus[]): Promise<PipelineItem[]> {
  const issues = await ghJson<any[]>([
    'issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '50',
    '--json', 'number,title,labels',
  ]);
  if (!issues) return [];

  const agentByIssue = new Map(agents.map(a => [a.issue, a]));
  const prByBranch = new Map(prs.map(p => [p.branch, p]));

  return issues.map(issue => {
    const agent = agentByIssue.get(issue.number);
    const branchPatterns = [`feat/issue-${issue.number}`, `fix/issue-${issue.number}`];
    const issueRe = new RegExp(`issue-${issue.number}(?:\\b|$)`);
    const pr = branchPatterns.map(b => prByBranch.get(b)).find(Boolean) ||
               prs.find(p => issueRe.test(p.branch));
    const labels = (issue.labels || []).map((l: any) => l.name);

    let stage: PipelineItem['stage'] = 'open';
    if (pr) {
      if (pr.ciStatus === 'failing') stage = 'ci_failed';
      else if (pr.ciStatus === 'pending') stage = 'ci_running';
      else if (pr.ciStatus === 'passing' && pr.reviewStatus !== 'approved') stage = 'ci_passed';
      else if (pr.reviewStatus === 'approved') stage = 'review';
      else stage = 'pr_open';
    } else if (agent) {
      stage = 'in_progress';
    }

    return {
      number: issue.number,
      title: issue.title,
      stage,
      tool: agent?.tool,
      prNumber: pr?.number,
      labels,
    };
  });
}

async function queryMetrics(): Promise<DashboardSnapshot['metrics']> {
  const today = new Date().toISOString().split('T')[0];
  const [closed, merged] = await Promise.all([
    ghJson<any[]>(['issue', 'list', '--repo', REPO, '--state', 'closed', '--limit', '50',
      '--json', 'closedAt', '--jq', `[.[] | select(.closedAt | startswith("${today}"))] | length`]),
    ghJson<any[]>(['pr', 'list', '--repo', REPO, '--state', 'merged', '--limit', '50',
      '--json', 'mergedAt', '--jq', `[.[] | select(.mergedAt | startswith("${today}"))] | length`]),
  ]);
  const openPRs = await ghJson<any[]>(['pr', 'list', '--repo', REPO, '--state', 'open', '--json', 'number', '--jq', 'length']);

  return {
    closedToday: typeof closed === 'number' ? closed : 0,
    mergedToday: typeof merged === 'number' ? merged : 0,
    openPRs: typeof openPRs === 'number' ? openPRs : 0,
    avgMergeHours: null,
  };
}

async function gatherSnapshot(): Promise<DashboardSnapshot> {
  const agents = await readRegistry();
  const claudeCount = agents.filter(a => a.tool === 'claude' && a.alive).length;
  const codexCount = agents.filter(a => a.tool === 'codex' && a.alive).length;

  const [activity, prs, metrics] = await Promise.all([
    readActivityLog(),
    queryPRs(),
    queryMetrics(),
  ]);

  const pipeline = await queryPipeline(agents, prs);

  return {
    timestamp: Date.now(),
    agents,
    capacity: {
      claude: { running: claudeCount, max: MAX_CLAUDE },
      codex: { running: codexCount, max: MAX_CODEX },
    },
    pipeline,
    activity,
    prs,
    metrics,
  };
}

// ── HTTP Server ──

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const DIST_ROOT = resolve(process.cwd(), 'dashboard', 'dist');

async function serveStatic(res: ServerResponse, urlPath: string) {
  // Parse URL to strip query strings and decode
  const parsedPath = new URL(urlPath, 'http://localhost').pathname;
  const filePath = parsedPath === '/' ? '/index.html' : parsedPath;
  const fullPath = resolve(DIST_ROOT, '.' + filePath);

  // Prevent path traversal: resolved path must stay under DIST_ROOT
  if (!fullPath.startsWith(DIST_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(fullPath);
    const ext = extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    // SPA fallback: serve index.html
    try {
      const index = await readFile(join(DIST_ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Dashboard not built. Run: npm run dashboard:build');
    }
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/';
  if (url === '/api/snapshot') {
    const snapshot = await gatherSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot));
  } else {
    await serveStatic(res, url);
  }
});

// ── WebSocket ──

const wss = new WebSocketServer({ noServer: true });
let currentSnapshot: DashboardSnapshot | null = null;

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  // Validate origin — only accept localhost connections
  const origin = req.headers.origin || '';
  const allowed = origin === '' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (!allowed) { socket.destroy(); return; }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws);
    if (currentSnapshot) ws.send(JSON.stringify(currentSnapshot));
  });
});

function broadcast(snapshot: DashboardSnapshot) {
  currentSnapshot = snapshot;
  const data = JSON.stringify(snapshot);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

// ── File Watching + Polling ──

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function refresh() {
  try {
    const snapshot = await gatherSnapshot();
    broadcast(snapshot);
  } catch (err) {
    console.error('[dashboard] snapshot error:', err);
  }
}

function debouncedRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, 2000);
}

async function startWatching() {
  // Watch .pm/ files
  if (await fileExists(PM_DIR)) {
    try {
      const watcher = watch(PM_DIR, { recursive: false });
      // Use for-await if available, fallback to polling
      (async () => {
        try {
          for await (const event of watcher) {
            if (event.filename === 'agent-registry.json' || event.filename === 'activity.log') {
              debouncedRefresh();
            }
          }
        } catch { /* watcher closed */ }
      })();
    } catch {
      console.log('[dashboard] fs.watch not available, using polling only');
    }
  }

  // GitHub poll every 30s
  setInterval(refresh, 30000);

  // Initial snapshot
  await refresh();
}

// ── Start ──

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Agent Dashboard running at http://127.0.0.1:${PORT}\n`);
  startWatching();
});
