import { useVST3Store } from '../../store/vst3Store';

/** GitHub releases base URL for companion app */
const RELEASES_URL = 'https://github.com/ace-step/ace-step-companion/releases/latest';

const DOWNLOAD_LINKS = [
  { platform: 'windows', label: 'Windows', testId: 'download-windows' },
  { platform: 'macos', label: 'macOS', testId: 'download-macos' },
  { platform: 'linux', label: 'Linux', testId: 'download-linux' },
] as const;

// ── Inline icons ────────────────────────────────────────────────────────────

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline strokeLinecap="round" strokeLinejoin="round" points="7 10 12 15 17 10" />
    <line strokeLinecap="round" x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const PlugIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v6m-3-3h6m-9 6h12a2 2 0 0 1 2 2v1a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1a2 2 0 0 1 2-2z" />
  </svg>
);

const AlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <line strokeLinecap="round" x1="12" y1="8" x2="12" y2="12" />
    <line strokeLinecap="round" x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/**
 * First-time setup wizard for VST3 companion app.
 * Guides users through: download → install → connect → scan workflow.
 *
 * Renders when:
 * - Wizard has not been dismissed
 * - Companion is not currently connected
 */
/** Detect user's platform for highlighting the appropriate download button */
function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'linux';
}

export function VST3SetupWizard() {
  const connectionStatus = useVST3Store((s) => s.connectionStatus);
  const connectionError = useVST3Store((s) => s.connectionError);
  const setupWizardDismissed = useVST3Store((s) => s.setupWizardDismissed);
  const dismissSetupWizard = useVST3Store((s) => s.dismissSetupWizard);
  const connect = useVST3Store((s) => s.connect);
  const userPlatform = detectPlatform();

  // Don't show if dismissed or already connected
  if (setupWizardDismissed || connectionStatus === 'connected') {
    return null;
  }

  const handleConnect = () => {
    connect();
  };

  const isConnecting = connectionStatus === 'connecting';
  const hasError = connectionStatus === 'error' && connectionError;

  return (
    <div
      data-testid="vst3-setup-wizard"
      className="mx-2 mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-4"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">VST3 Plugin Setup</h3>
        <button
          type="button"
          onClick={dismissSetupWizard}
          data-testid="wizard-dismiss-btn"
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Dismiss setup wizard"
        >
          Skip
        </button>
      </div>

      <p className="mb-4 text-[11px] leading-relaxed text-zinc-400">
        Use your existing VST3 plugins with ACE-Step DAW via the companion app.
        The companion runs locally and bridges your plugins to the browser.
      </p>

      {/* Step 1: Download */}
      <div data-testid="wizard-step-download" className="mb-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-400">
            1
          </div>
          <span className="text-xs font-medium text-zinc-300">Download Companion App</span>
        </div>
        <div className="ml-7 flex flex-wrap gap-2">
          {DOWNLOAD_LINKS.map(({ platform, label, testId }) => {
            const isCurrentPlatform = platform === userPlatform;
            return (
              <a
                key={testId}
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={testId}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] transition-colors hover:border-violet-500/50 hover:bg-white/10 hover:text-white ${
                  isCurrentPlatform
                    ? 'border-violet-500/40 bg-violet-600/20 text-white font-medium'
                    : 'border-white/10 bg-white/5 text-zinc-300'
                }`}
              >
                <DownloadIcon className="h-3 w-3" />
                {label}
              </a>
            );
          })}
        </div>
      </div>

      {/* Step 2: Connect */}
      <div data-testid="wizard-step-connect" className="mb-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600/30 text-[10px] font-bold text-violet-400">
            2
          </div>
          <span className="text-xs font-medium text-zinc-300">Start & Connect</span>
        </div>
        <div className="ml-7">
          <p className="mb-2 text-[10px] text-zinc-500">
            Start the companion app, then click Connect below.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            data-testid="wizard-connect-btn"
            className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            <PlugIcon className="h-3.5 w-3.5" />
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {hasError && (
        <div
          data-testid="wizard-error"
          className="mt-3 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <div>
            <p className="text-[11px] font-medium text-red-400">Connection failed</p>
            <p className="text-[10px] text-red-400/70">{connectionError}</p>
            <p className="mt-1 text-[10px] text-zinc-500">
              Make sure the companion app is running on port 9851.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
