import type { EnhancementNode } from '../../types/enhance';

export interface VersionTreeNodesProps {
  nodes: EnhancementNode[];
  getChildren: (parentId: string) => EnhancementNode[];
  activeNodeId: string | null;
  onNodeClick: (node: EnhancementNode) => void;
  depth: number;
}

/** Recursive version tree node renderer */
export function VersionTreeNodes({
  nodes,
  getChildren,
  activeNodeId,
  onNodeClick,
  depth,
}: VersionTreeNodesProps) {
  return (
    <>
      {nodes.map((node, idx) => {
        const isActive = node.id === activeNodeId;
        const children = getChildren(node.id);
        const versionNum = idx + 1 + depth;
        return (
          <div key={node.id}>
            <button
              data-testid={`version-tree-node-${node.id}`}
              onClick={() => onNodeClick(node)}
              className={`w-full text-left py-1.5 rounded-md text-[10px] transition-colors truncate flex items-center gap-1.5 ${
                isActive
                  ? 'bg-[#2a2a2e] text-teal-300'
                  : 'text-zinc-500 hover:bg-[#222226] hover:text-zinc-300'
              }`}
              style={{ paddingLeft: `${8 + depth * 10}px` }}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActive ? 'bg-teal-400' : 'bg-zinc-600'
              }`} />
              <span className="truncate">
                v{versionNum} ({node.label})
                {isActive && ' \u2190'}
              </span>
            </button>
            {children.length > 0 && (
              <VersionTreeNodes
                nodes={children}
                getChildren={getChildren}
                activeNodeId={activeNodeId}
                onNodeClick={onNodeClick}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
