import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useVST3Store } from '../../store/vst3Store';
import { useProjectStore } from '../../store/projectStore';
import { VST3PluginBrowser } from './VST3PluginBrowser';
import { ActivePlugins } from './ActivePlugins';
import { VST3SetupWizard } from './VST3SetupWizard';
import { Z } from '../../utils/zIndex';

export function VST3SidePanel() {
  const show = useUIStore((s) => s.showVST3Panel);
  const setShow = useUIStore((s) => s.setShowVST3Panel);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const firstTrackId = useProjectStore((s) => s.project?.tracks[0]?.id ?? '');
  const loadPlugin = useVST3Store((s) => s.loadPlugin);

  // Delay unmount for exit animation
  const [renderPanel, setRenderPanel] = useState(show);
  useEffect(() => {
    if (show) setRenderPanel(true);
    else {
      const t = setTimeout(() => setRenderPanel(false), 300);
      return () => clearTimeout(t);
    }
  }, [show]);

  const handleLoadPlugin = useCallback(
    (pluginId: string) => {
      // Use the first selected track, or fall back to the first track in the project
      const [firstSelected] = selectedTrackIds;
      const trackId = firstSelected ?? firstTrackId;
      if (!trackId) return;
      loadPlugin(pluginId, trackId);
    },
    [selectedTrackIds, firstTrackId, loadPlugin],
  );

  if (!renderPanel && !show) return null;

  return (
    <aside
      className={`fixed right-0 top-10 bottom-6 flex w-80 flex-col border-l border-[#333] bg-[#1e1e1e] shadow-2xl transition-all duration-300 ease-out ${
        show ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+28px)] opacity-0'
      }`}
      style={{ zIndex: Z.panel }}
      data-testid="vst3-side-panel"
      aria-label="VST3 Plugin Browser"
      aria-hidden={!show}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <span className="text-xs font-semibold text-zinc-200">VST3 Plugins</span>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#404040] bg-[#262626] text-zinc-400 transition-colors hover:border-[#555] hover:text-zinc-200"
          aria-label="Close VST3 panel"
          data-testid="vst3-panel-close"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Setup Wizard + Plugin Browser + Active Plugins */}
      <div className="flex-1 overflow-y-auto">
        <VST3SetupWizard />
        <VST3PluginBrowser onLoadPlugin={handleLoadPlugin} />
        <ActivePlugins />
      </div>
    </aside>
  );
}
