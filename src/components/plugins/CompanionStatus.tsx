import { useVST3Store } from '../../store/vst3Store';
import { useUIStore } from '../../store/uiStore';
import { _getBridgeClient } from '../../hooks/useVST3Connection';

/**
 * Small toolbar indicator showing VST3 companion connection state.
 * - Connected: click opens/closes Plugin Browser panel
 * - Disconnected: click connects
 * - Right-click when connected: disconnect
 */
export function CompanionStatus() {
  const status = useVST3Store((s) => s.connectionStatus);
  const version = useVST3Store((s) => s.companionVersion);
  const showPanel = useUIStore((s) => s.showVST3Panel);
  const togglePanel = useUIStore((s) => s.toggleVST3Panel);

  const handleClick = () => {
    if (status === 'connected') {
      togglePanel();
    } else if (status === 'disconnected' || status === 'error') {
      _getBridgeClient().connect();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (status === 'connected') {
      e.preventDefault();
      _getBridgeClient().disconnect();
    }
  };

  const dotClass =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500';

  const label =
    status === 'connected'
      ? 'Connected'
      : status === 'connecting'
        ? 'Connecting...'
        : 'Disconnected';

  const tooltipText = version
    ? `VST3 Companion v${version}`
    : 'VST3 Companion — click to connect';

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={tooltipText}
      aria-label={`VST3 companion: ${label}`}
      data-testid="companion-status"
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/8 hover:text-white ${
        showPanel ? 'bg-white/10 text-white' : ''
      }`}
    >
      <span
        data-testid="companion-status-dot"
        className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </button>
  );
}
