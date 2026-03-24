import { useVST3Store } from '../../store/vst3Store';

/**
 * Small toolbar indicator showing VST3 companion connection state.
 * Click toggles connect / disconnect.
 */
export function CompanionStatus() {
  const status = useVST3Store((s) => s.connectionStatus);
  const version = useVST3Store((s) => s.companionVersion);
  const connect = useVST3Store((s) => s.connect);
  const disconnect = useVST3Store((s) => s.disconnect);

  const handleClick = () => {
    if (status === 'connected') {
      disconnect();
    } else if (status === 'disconnected') {
      connect();
    }
    // do nothing while connecting
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
    : 'VST3 Companion';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltipText}
      aria-label={`VST3 companion: ${label}`}
      data-testid="companion-status"
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/8 hover:text-white"
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
