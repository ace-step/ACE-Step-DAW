import { useVST3Store } from '../../store/vst3Store';
import { useUIStore } from '../../store/uiStore';
import type { CompanionAppStatus } from '../../types/vst3';

/** GitHub releases URL for companion app downloads */
const COMPANION_DOWNLOAD_URL = 'https://github.com/ace-step/ace-step-companion/releases/latest';

/**
 * Small toolbar indicator showing VST3 companion connection state.
 * Enhanced with:
 * - Not-installed detection with download CTA
 * - Outdated version warning
 * - Stopped companion detection
 * - Error message display
 */
export function CompanionStatus() {
  const status = useVST3Store((s) => s.connectionStatus);
  const version = useVST3Store((s) => s.companionVersion);
  const appStatus = useVST3Store((s) => s.companionAppStatus);
  const connectionError = useVST3Store((s) => s.connectionError);
  const storeConnect = useVST3Store((s) => s.connect);
  const storeDisconnect = useVST3Store((s) => s.disconnect);
  const showPanel = useUIStore((s) => s.showVST3Panel);
  const togglePanel = useUIStore((s) => s.toggleVST3Panel);

  const handleClick = () => {
    if (status === 'connected') {
      togglePanel();
    } else if (status === 'disconnected' || status === 'error') {
      storeConnect();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (status === 'connected') {
      e.preventDefault();
      storeDisconnect();
    }
  };

  const { dotClass, label } = getStatusDisplay(status, appStatus);

  const tooltipText = version
    ? `VST3 Companion v${version}`
    : appStatus === 'not-installed'
      ? 'VST3 Companion — not installed. Click to download.'
      : 'VST3 Companion — click to connect';

  return (
    <div className="flex items-center gap-1">
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

      {/* Download CTA for not-installed state */}
      {appStatus === 'not-installed' && (
        <a
          href={COMPANION_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="companion-download-cta"
          className="rounded-md bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-500 transition-colors"
          title="Download VST3 Companion App"
        >
          Download
        </a>
      )}

      {/* Error message */}
      {connectionError && status === 'error' && (
        <span
          data-testid="companion-error-msg"
          className="max-w-[120px] truncate text-[10px] text-red-400"
          title={connectionError}
        >
          {connectionError}
        </span>
      )}
    </div>
  );
}

function getStatusDisplay(
  connectionStatus: string,
  appStatus: CompanionAppStatus,
): { dotClass: string; label: string } {
  if (connectionStatus === 'connected') {
    if (appStatus === 'outdated') {
      return { dotClass: 'bg-amber-400', label: 'Update Available' };
    }
    return { dotClass: 'bg-emerald-500', label: 'Connected' };
  }

  if (connectionStatus === 'connecting') {
    return { dotClass: 'bg-amber-400 animate-pulse', label: 'Connecting...' };
  }

  // Disconnected or error states
  if (appStatus === 'not-installed') {
    return { dotClass: 'bg-red-500', label: 'Not Installed' };
  }
  if (appStatus === 'not-running') {
    return { dotClass: 'bg-zinc-500', label: 'Stopped' };
  }

  return { dotClass: 'bg-red-500', label: 'Disconnected' };
}
