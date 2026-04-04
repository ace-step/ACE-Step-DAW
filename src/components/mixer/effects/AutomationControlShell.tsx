/**
 * AutomationControlShell — Context menu wrapper for automation lane management.
 * Extracted from EffectCards.tsx.
 */
import { useState, type ReactNode } from 'react';
import { ContextMenuWrapper, ContextMenuItem } from '../../ui/ContextMenu';
import { useProjectStore } from '../../../store/projectStore';
import { getEffectAutomationLabel } from '../../../utils/effectAutomation';
import { automationParamEquals } from '../../../types/project';
import type {
  AutomationParameter,
  AutomatableEffectTarget,
  TrackEffect,
} from '../../../types/project';

interface AutomationControlShellProps {
  trackId: string;
  effect: TrackEffect;
  target: AutomatableEffectTarget;
  normalizedValue: number;
  children: ReactNode;
}

export function AutomationControlShell({
  trackId,
  effect,
  target,
  normalizedValue,
  children,
}: AutomationControlShellProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const parameter = {
    type: 'effect',
    effectId: effect.id,
    effectType: target.effectType,
    param: target.param,
  } as AutomationParameter;
  const ensureAutomationLane = useProjectStore((s) => s.ensureAutomationLane);
  const clearAutomationLane = useProjectStore((s) => s.clearAutomationLane);
  const hasLane = useProjectStore((s) =>
    (s.project?.automationLanes ?? []).some(
      (lane) =>
        lane.trackId === trackId &&
        automationParamEquals(lane.parameter, parameter),
    ),
  );
  const label = getEffectAutomationLabel(target.effectType, target.param);

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={`${label} (right-click for automation lane)`}
      >
        {children}
      </div>
      {menu && (
        <ContextMenuWrapper x={menu.x} y={menu.y} onClose={() => setMenu(null)} minWidth={170}>
          <ContextMenuItem
            label="Show Automation Lane"
            onClick={() => {
              ensureAutomationLane(trackId, parameter, normalizedValue);
              setMenu(null);
            }}
          />
          {hasLane && (
            <ContextMenuItem
              label="Hide Automation Lane"
              onClick={() => {
                clearAutomationLane(trackId, parameter);
                setMenu(null);
              }}
              color="#a1a1aa"
            />
          )}
        </ContextMenuWrapper>
      )}
    </>
  );
}
