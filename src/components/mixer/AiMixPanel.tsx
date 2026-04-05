/**
 * AI Mixing Panel — shows AI-suggested mix parameters with accept/reject/tweak.
 * Follows the same layout pattern as MasteringPanel.
 * Issue #738
 */
import { useCallback } from 'react';
import { useAiMixStore } from '../../store/aiMixStore';
import { useProjectStore } from '../../store/projectStore';
import { analyzeAiMix, formatDb, formatPan } from '../../services/aiMixService';
import type { AiMixMode, TrackMixParams } from '../../types/api';

const MODE_OPTIONS: Array<{ value: AiMixMode; label: string; description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Optimize mix automatically' },
  { value: 'reference', label: 'Reference', description: 'Match a reference mix style' },
  { value: 'text', label: 'Text', description: 'Guide mix with natural language' },
];

const LUFS_TARGETS = [-14, -11, -8] as const;

function ParamRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-zinc-400">{label}</span>
      <span className={className ?? 'text-zinc-200 font-mono'}>{value}</span>
    </div>
  );
}

function TrackSuggestionCard({
  trackName,
  params,
  expanded,
  onToggle,
  onAccept,
}: {
  trackName: string;
  params: TrackMixParams;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="rounded border border-[#313131] bg-[#151515] px-2 py-1.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="text-[10px] font-medium text-zinc-200 hover:text-white transition-colors"
        >
          {expanded ? '▾' : '▸'} {trackName}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500 font-mono">
            {formatDb(params.gain_db)} · {formatPan(params.pan)}
          </span>
          <button
            type="button"
            onClick={onAccept}
            className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-600/25 text-emerald-300 hover:bg-emerald-600/40 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-1.5 space-y-0.5 pl-3 border-l border-[#2a2a2a]">
          <ParamRow label="Gain" value={formatDb(params.gain_db)} />
          <ParamRow label="Pan" value={formatPan(params.pan)} />
          {params.reverb_send !== undefined && (
            <ParamRow label="Reverb Send" value={`${(params.reverb_send * 100).toFixed(0)}%`} />
          )}
          {params.delay_send !== undefined && (
            <ParamRow label="Delay Send" value={`${(params.delay_send * 100).toFixed(0)}%`} />
          )}
          {params.compressor && (
            <>
              <ParamRow label="Comp Threshold" value={formatDb(params.compressor.threshold_db)} />
              <ParamRow label="Comp Ratio" value={`${params.compressor.ratio}:1`} />
              <ParamRow label="Comp Attack" value={`${params.compressor.attack_ms} ms`} />
              <ParamRow label="Comp Release" value={`${params.compressor.release_ms} ms`} />
            </>
          )}
          {params.eq && params.eq.length > 0 && (
            <div className="mt-1">
              <div className="text-[9px] text-zinc-500 uppercase tracking-wide">EQ</div>
              {params.eq.map((band, i) => (
                <ParamRow
                  key={i}
                  label={`${band.type} ${band.frequency_hz} Hz`}
                  value={`${formatDb(band.gain_db)} Q=${band.q.toFixed(1)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AiMixPanel() {
  const status = useAiMixStore((s) => s.status);
  const error = useAiMixStore((s) => s.error);
  const mode = useAiMixStore((s) => s.mode);
  const textPrompt = useAiMixStore((s) => s.textPrompt);
  const targetLufs = useAiMixStore((s) => s.targetLufs);
  const suggestion = useAiMixStore((s) => s.suggestion);
  const expandedTrackName = useAiMixStore((s) => s.expandedTrackName);

  const setMode = useAiMixStore((s) => s.setMode);
  const setTextPrompt = useAiMixStore((s) => s.setTextPrompt);
  const setTargetLufs = useAiMixStore((s) => s.setTargetLufs);
  const acceptAll = useAiMixStore((s) => s.acceptAll);
  const acceptTrack = useAiMixStore((s) => s.acceptTrack);
  const reject = useAiMixStore((s) => s.reject);
  const toggleTrackExpand = useAiMixStore((s) => s.toggleTrackExpand);
  const closePanel = useAiMixStore((s) => s.closePanel);
  const reset = useAiMixStore((s) => s.reset);

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const updateTrackMixer = useProjectStore((s) => s.updateTrackMixer);

  const trackNames = suggestion ? Object.keys(suggestion.tracks) : [];

  /** Find a project track by AI-suggested name (case-insensitive match on displayName or trackName). */
  const findTrack = useCallback((name: string) => {
    if (!project) return undefined;
    return project.tracks.find(
      (t) => t.displayName.toLowerCase() === name.toLowerCase() ||
             t.trackName === name,
    );
  }, [project]);

  const handleAnalyze = useCallback(() => {
    void analyzeAiMix();
  }, []);

  /** Apply a single track's AI mix suggestions. */
  const applyTrackParams = useCallback((trackName: string, params: TrackMixParams) => {
    const track = findTrack(trackName);
    if (!track) return;
    updateTrack(track.id, {
      volume: params.gain_db,
      muted: params.mute ?? false,
      soloed: params.solo ?? false,
    });
    updateTrackMixer(track.id, { pan: params.pan });
  }, [findTrack, updateTrack, updateTrackMixer]);

  const handleAcceptAll = useCallback(() => {
    const result = acceptAll();
    if (!result) return;
    for (const [name, params] of Object.entries(result.tracks)) {
      applyTrackParams(name, params);
    }
  }, [acceptAll, applyTrackParams]);

  const handleAcceptTrack = useCallback((trackName: string) => {
    const params = acceptTrack(trackName);
    if (!params) return;
    applyTrackParams(trackName, params);
  }, [acceptTrack, applyTrackParams]);

  return (
    <div
      className="w-full rounded-lg border border-[#3a3a3a] bg-[#1d1d1d] px-3 py-2 text-[10px] text-zinc-300"
      data-testid="ai-mix-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-violet-400">AI Mix</div>
          <div className="text-[10px] text-zinc-400">Parameter-level mix optimization</div>
        </div>
        <div className="flex gap-1">
          {status !== 'analyzing' && (
            <button
              type="button"
              onClick={handleAnalyze}
              aria-label="Analyze mix with AI"
              className="rounded bg-violet-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-violet-500"
            >
              {suggestion ? 'Re-analyze' : 'AI Mix'}
            </button>
          )}
          {status === 'analyzing' && (
            <button
              disabled
              className="rounded bg-violet-600/60 px-2.5 py-1 text-[10px] font-semibold text-white cursor-wait opacity-60"
            >
              Analyzing...
            </button>
          )}
          <button
            type="button"
            onClick={closePanel}
            className="rounded bg-[#303030] px-2 py-1 text-[10px] text-zinc-300 hover:bg-[#3a3a3a] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Mode + controls */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {/* Mode buttons */}
        <div className="flex gap-0.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                mode === opt.value
                  ? 'bg-violet-600/50 text-violet-200'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              title={opt.description}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Text prompt input (for text mode) */}
        {mode === 'text' && (
          <input
            type="text"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="e.g. warm vocals, punchy drums"
            className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300 flex-1 min-w-[140px]"
          />
        )}

        {/* LUFS target */}
        <div className="flex gap-0.5">
          {LUFS_TARGETS.map((lufs) => (
            <button
              key={lufs}
              type="button"
              onClick={() => setTargetLufs(lufs)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                targetLufs === lufs
                  ? 'bg-violet-600/40 text-violet-200'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              title={`Target loudness: ${lufs} LUFS`}
            >
              {lufs}
            </button>
          ))}
        </div>
      </div>

      {/* Analyzing state */}
      {status === 'analyzing' && (
        <div className="mt-2 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#2b2b2b]">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-500" />
          </div>
          <p className="text-[10px] text-zinc-400">
            Analyzing tracks and optimizing mix parameters...
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-red-400">Error: {error}</span>
          <button
            type="button"
            onClick={reset}
            className="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-zinc-400 hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results — per-track suggestions */}
      {status === 'reviewing' && suggestion && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-zinc-400">
              Suggested Changes ({trackNames.length} tracks)
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={reject}
                className="px-2 py-0.5 rounded text-[9px] bg-red-600/20 text-red-300 hover:bg-red-600/40 transition-colors"
              >
                Reject All
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="px-2 py-0.5 rounded text-[9px] bg-emerald-600/25 text-emerald-200 hover:bg-emerald-600/45 transition-colors"
              >
                Accept All
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {trackNames.map((name) => (
              <TrackSuggestionCard
                key={name}
                trackName={name}
                params={suggestion.tracks[name]}
                expanded={expandedTrackName === name}
                onToggle={() => toggleTrackExpand(name)}
                onAccept={() => handleAcceptTrack(name)}
              />
            ))}
          </div>

          {/* Master bus */}
          {suggestion.master && suggestion.master.target_lufs !== undefined && (
            <div className="rounded border border-violet-900/50 bg-violet-950/20 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-violet-400">Master Bus</div>
              <div className="mt-1 space-y-0.5">
                {suggestion.master.target_lufs !== undefined && (
                  <ParamRow label="Target LUFS" value={`${suggestion.master.target_lufs} LUFS`} />
                )}
                {suggestion.master.limiter_ceiling_db !== undefined && (
                  <ParamRow label="Limiter Ceiling" value={formatDb(suggestion.master.limiter_ceiling_db)} />
                )}
                {suggestion.master.compressor && (
                  <ParamRow
                    label="Compressor"
                    value={`${formatDb(suggestion.master.compressor.threshold_db)} ${suggestion.master.compressor.ratio}:1`}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
