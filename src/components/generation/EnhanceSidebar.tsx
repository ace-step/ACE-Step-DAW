import { VersionTreeNodes } from './VersionTree';
import type { EnhancementNode, EnhancementSession } from '../../types/enhance';

interface SessionEntry {
  id: string;
  label: string;
  timestamp: number;
}

interface EnhanceSidebarProps {
  enhancementSession: EnhancementSession | null;
  versionTreeRoots: EnhancementNode[];
  getNodeChildren: (parentId: string) => EnhancementNode[];
  onVersionTreeClick: (node: EnhancementNode) => void;
  onVersionTreeOriginal: () => void;
  sessions: SessionEntry[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onNewSession: () => void;
}

export function EnhanceSidebar({
  enhancementSession,
  versionTreeRoots,
  getNodeChildren,
  onVersionTreeClick,
  onVersionTreeOriginal,
  sessions,
  activeSessionId,
  onSessionClick,
  onNewSession,
}: EnhanceSidebarProps) {
  return (
    <div data-testid="enhance-history" className="w-[150px] min-w-[150px] border-r border-[#3a3a3a] flex flex-col bg-[#1a1a1e]">
      <div className="px-3 pt-3 pb-2">
        <button
          data-testid="enhance-new-session-btn"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2e] hover:bg-[#333338] text-zinc-300 text-[11px] font-medium transition-colors"
        >
          <span className="text-sm leading-none">+</span>
          New Enhance
        </button>
      </div>

      {enhancementSession && enhancementSession.nodes.length > 0 && (
        <div data-testid="version-tree" className="px-1.5 pb-2 border-b border-[#3a3a3a] mb-1">
          <p className="text-[9px] text-zinc-600 uppercase tracking-wide px-2 mb-1">Versions</p>
          <button
            data-testid="version-tree-original"
            onClick={onVersionTreeOriginal}
            className={`w-full text-left px-2 py-1.5 rounded-md text-[10px] transition-colors truncate flex items-center gap-1.5 ${
              enhancementSession.activeNodeId === null
                ? 'bg-[#2a2a2e] text-teal-300'
                : 'text-zinc-500 hover:bg-[#222226] hover:text-zinc-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              enhancementSession.activeNodeId === null ? 'bg-teal-400' : 'bg-zinc-600'
            }`} />
            v0 (Original)
          </button>
          <VersionTreeNodes
            nodes={versionTreeRoots}
            getChildren={getNodeChildren}
            activeNodeId={enhancementSession.activeNodeId}
            onNodeClick={onVersionTreeClick}
            depth={0}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSessionClick(s.id)}
            className={`w-full text-left px-2.5 py-2 rounded-md text-[11px] transition-colors truncate ${
              s.id === activeSessionId
                ? 'bg-[#2a2a2e] text-zinc-100'
                : 'text-zinc-500 hover:bg-[#222226] hover:text-zinc-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
