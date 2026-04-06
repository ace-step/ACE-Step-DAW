/**
 * AI Arrangement Assistant Panel
 *
 * Floating panel that analyzes the current arrangement and provides
 * section detection, next-section suggestions, instrumentation
 * recommendations, chord progressions, and gap-fill suggestions.
 */
import { useCallback, useEffect, useState } from 'react';
import { useArrangementAssistantStore } from '../../store/arrangementAssistantStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';
import type { ArrangementSection, ArrangementSuggestion, SuggestionKind } from '../../types/arrangement';
import { SECTION_COLORS as SECTION_HEX_COLORS } from '../timeline/SectionSelector';

const SUGGESTION_ICONS: Record<SuggestionKind, string> = {
  'next-section': '⊕',
  'instrumentation': '🎹',
  'chord-progression': '♪',
  'fill-gap': '⬚',
};

const SUGGESTION_COLORS: Record<SuggestionKind, string> = {
  'next-section': 'border-violet-500/40 bg-violet-500/8',
  'instrumentation': 'border-emerald-500/40 bg-emerald-500/8',
  'chord-progression': 'border-amber-500/40 bg-amber-500/8',
  'fill-gap': 'border-sky-500/40 bg-sky-500/8',
};

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionBadge({ section }: { section: ArrangementSection }) {
  const hexColor = SECTION_HEX_COLORS[section.type] ?? '#71717a';
  const startMins = Math.floor(section.startTime / 60);
  const startSecs = Math.floor(section.startTime % 60);
  const endMins = Math.floor(section.endTime / 60);
  const endSecs = Math.floor(section.endTime % 60);
  const timeStr = `${startMins}:${startSecs.toString().padStart(2, '0')} – ${endMins}:${endSecs.toString().padStart(2, '0')}`;

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border"
      style={{
        borderColor: `${hexColor}40`,
        backgroundColor: `${hexColor}18`,
        color: hexColor,
      }}
      data-testid={`section-badge-${section.id}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider">{section.type}</span>
      <span className="text-[9px] opacity-60">{timeStr}</span>
      <span className="text-[9px] opacity-40">{section.trackIds.length} tracks</span>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: ArrangementSuggestion;
  onAccept: () => void;
  onReject: () => void;
}) {
  const colorClasses = SUGGESTION_COLORS[suggestion.kind] ?? '';
  const icon = SUGGESTION_ICONS[suggestion.kind] ?? '✦';
  const isResolved = suggestion.status !== 'pending';

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-200 ${colorClasses} ${
        isResolved ? 'opacity-50' : ''
      }`}
      data-testid={`suggestion-card-${suggestion.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5 flex-shrink-0" role="img" aria-hidden="true">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <h4 className="text-[11px] font-medium text-zinc-100 truncate">{suggestion.title}</h4>
            {suggestion.sectionType && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-white/8 text-zinc-400 uppercase tracking-wider">
                {suggestion.sectionType}
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-400 leading-relaxed">{suggestion.description}</p>
          {suggestion.tags && suggestion.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {suggestion.tags.map((tag, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/6 text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {!isResolved && (
        <div className="flex items-center gap-2 mt-2.5 ml-6">
          <button
            type="button"
            onClick={onAccept}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-medium hover:bg-emerald-500/30 transition-colors cursor-pointer"
            data-testid={`accept-suggestion-${suggestion.id}`}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5" /></svg>
            Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-500/20 text-zinc-400 text-[10px] font-medium hover:bg-zinc-500/30 transition-colors cursor-pointer"
            data-testid={`reject-suggestion-${suggestion.id}`}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
            Dismiss
          </button>
        </div>
      )}
      {suggestion.status === 'accepted' && (
        <div className="mt-2 ml-6 text-[10px] text-emerald-400 flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5" /></svg>
          Accepted
        </div>
      )}
      {suggestion.status === 'rejected' && (
        <div className="mt-2 ml-6 text-[10px] text-zinc-500">Dismissed</div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────

export function ArrangementAssistantPanel() {
  const isOpen = useArrangementAssistantStore((s) => s.isOpen);
  const isAnalyzing = useArrangementAssistantStore((s) => s.isAnalyzing);
  const sections = useArrangementAssistantStore((s) => s.sections);
  const suggestions = useArrangementAssistantStore((s) => s.suggestions);
  const projectMeta = useArrangementAssistantStore((s) => s.projectMeta);
  const error = useArrangementAssistantStore((s) => s.error);
  const analyze = useArrangementAssistantStore((s) => s.analyze);
  const acceptSuggestion = useArrangementAssistantStore((s) => s.acceptSuggestion);
  const rejectSuggestion = useArrangementAssistantStore((s) => s.rejectSuggestion);
  const setOpen = useArrangementAssistantStore((s) => s.setOpen);
  const lastAnalyzedProjectId = useArrangementAssistantStore((s) => s.lastAnalyzedProjectId);

  const project = useProjectStore((s) => s.project);

  const [activeTab, setActiveTab] = useState<'sections' | 'suggestions'>('suggestions');

  // Auto-analyze when panel opens or project changes
  useEffect(() => {
    if (isOpen && project && project.id !== lastAnalyzedProjectId) {
      analyze();
    }
  }, [isOpen, project, project?.id, lastAnalyzedProjectId, analyze]);

  const handleRefresh = useCallback(() => {
    analyze();
  }, [analyze]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  // Filter suggestions by status
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const resolvedSuggestions = suggestions.filter((s) => s.status !== 'pending');

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-4 flex flex-col bg-[#1a1a1e] border border-[#333] rounded-xl shadow-2xl text-xs text-zinc-200 overflow-hidden"
      style={{
        zIndex: Z.panel,
        top: 52,
        width: 320,
        maxHeight: 'calc(100vh - 120px)',
      }}
      data-testid="arrangement-assistant-panel"
      aria-label="Arrangement Assistant"
      role="region"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#333] bg-[#1e1e22]">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-sm" role="img" aria-label="Arrangement">✦</span>
          <h3 className="text-[11px] font-semibold text-zinc-100">Arrangement Assistant</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/8 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Re-analyze arrangement"
            disabled={isAnalyzing}
            data-testid="arrangement-refresh"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={isAnalyzing ? 'animate-spin' : ''}>
              <path d="M1 6a5 5 0 0 1 9-3M11 6a5 5 0 0 1-9 3" />
              <path d="M10 1v2.5H7.5M2 11V8.5h2.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/8 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Close"
            data-testid="arrangement-close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
          </button>
        </div>
      </div>

      {/* Project meta info */}
      {projectMeta && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-[#1c1c20] border-b border-[#2a2a2e]">
          <span className="text-[9px] text-zinc-500">{projectMeta.bpm} BPM</span>
          <span className="text-[9px] text-zinc-500">{projectMeta.keyScale}</span>
          <span className="text-[9px] text-zinc-500">{projectMeta.timeSignature}/{projectMeta.timeSignatureDenominator}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-[#2a2a2e]">
        <button
          type="button"
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 px-3 py-2 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'suggestions'
              ? 'text-amber-300 border-b-2 border-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Suggestions {pendingSuggestions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[8px]">
              {pendingSuggestions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sections')}
          className={`flex-1 px-3 py-2 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'sections'
              ? 'text-amber-300 border-b-2 border-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Sections {sections.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400 text-[8px]">
              {sections.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        {error && (
          <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-[10px]">
            {error}
          </div>
        )}

        {isAnalyzing && (
          <div className="flex items-center justify-center py-8 text-zinc-500 text-[10px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin mr-2">
              <circle cx="8" cy="8" r="6" strokeDasharray="32" strokeDashoffset="8" />
            </svg>
            Analyzing arrangement...
          </div>
        )}

        {!isAnalyzing && activeTab === 'suggestions' && (
          <>
            {pendingSuggestions.length === 0 && resolvedSuggestions.length === 0 && !error && (
              <div className="text-center py-8 text-zinc-500 text-[10px]">
                <p>No suggestions yet.</p>
                <p className="mt-1">Add some clips to your arrangement, then click refresh.</p>
              </div>
            )}
            {pendingSuggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onAccept={() => acceptSuggestion(s.id)}
                onReject={() => rejectSuggestion(s.id)}
              />
            ))}
            {resolvedSuggestions.length > 0 && (
              <details className="mt-3">
                <summary className="text-[9px] text-zinc-500 cursor-pointer hover:text-zinc-400 select-none">
                  {resolvedSuggestions.length} resolved suggestion{resolvedSuggestions.length > 1 ? 's' : ''}
                </summary>
                <div className="mt-2 space-y-2">
                  {resolvedSuggestions.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      onAccept={() => acceptSuggestion(s.id)}
                      onReject={() => rejectSuggestion(s.id)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {!isAnalyzing && activeTab === 'sections' && (
          <>
            {sections.length === 0 && !error && (
              <div className="text-center py-8 text-zinc-500 text-[10px]">
                No sections detected. Add clips to your arrangement.
              </div>
            )}
            <div className="space-y-1.5">
              {sections.map((section) => (
                <SectionBadge key={section.id} section={section} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
