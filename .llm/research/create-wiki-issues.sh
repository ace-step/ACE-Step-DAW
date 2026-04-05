#!/usr/bin/env bash
# Create GitHub Issues from Karpathy LLM Wiki analysis
# Usage: GH_TOKEN=your_token bash create-wiki-issues.sh
# Or: gh auth login first, then bash create-wiki-issues.sh

set -euo pipefail

REPO="ace-step/ACE-Step-DAW"

# Check for authentication
if command -v gh &>/dev/null; then
  CREATE_ISSUE() {
    gh issue create --repo "$REPO" --title "$1" --body "$2" --label "$3"
  }
elif [ -n "${GH_TOKEN:-}" ]; then
  CREATE_ISSUE() {
    local title="$1" body="$2" labels="$3"
    local label_json
    label_json=$(echo "$labels" | jq -R 'split(",") | map(ltrimstr(" "))' 2>/dev/null || echo '[]')
    curl -s -X POST "https://api.github.com/repos/$REPO/issues" \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg t "$title" --arg b "$body" --argjson l "$label_json" \
        '{title: $t, body: $b, labels: $l}')" | jq -r '.html_url // .message'
  }
else
  echo "Error: No GitHub auth found. Either install 'gh' CLI or set GH_TOKEN env var."
  exit 1
fi

echo "Creating 6 issues for LLM Wiki pattern integration..."
echo ""

# Issue 1
echo ">>> Issue 1/6: Project Creative Wiki"
CREATE_ISSUE \
  "feat: Project Creative Wiki — persistent per-project knowledge base" \
  "$(cat <<'BODY'
## Summary

Apply [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) to DAW projects. Each project gets a persistent, LLM-maintained wiki that compounds creative knowledge across sessions.

## Problem

Each DAW project has only basic metadata (BPM, key, globalCaption). When an AI assistant helps compose music across multiple sessions, it has no memory of:
- Why the user chose a particular genre direction
- What reference tracks inspired the project
- Which generation parameters produced the best results
- Mix decisions and their rationale
- Lyric themes, narrative arc, character voice

Every session starts from zero creative context.

## Proposed Solution

Add a **per-project wiki** (stored in IndexedDB alongside the project) that the AI maintains:

```
project-wiki/
  index.md          — Table of contents, auto-updated
  creative-brief.md — Genre, mood, references, target audience
  generation-log.md — What parameters/prompts worked (append-only)
  mix-decisions.md  — Why each mix choice was made
  track-notes/
    drums.md        — Per-track creative rationale
    bass.md
    vocals.md
```

**Ingest trigger**: After every generation/cover/repaint, AI updates relevant wiki pages with what was tried and what worked.

**Query trigger**: When starting a new session with an existing project, AI reads the wiki first to restore creative context.

**Lint trigger**: When user runs `/daw:mix` or `/daw:arrange`, cross-check wiki for contradictions (e.g., "creative brief says 'minimal' but 12 tracks added").

## Acceptance Criteria

- [ ] `ProjectWiki` type added to `src/types/project.ts`
- [ ] Wiki pages stored in IndexedDB under `wiki:<projectId>:<pageName>`
- [ ] Generation pipeline auto-updates `generation-log.md` after successful generation
- [ ] `/daw:daw-status` reads and summarizes project wiki
- [ ] Wiki included in `.acedaw` archive export
- [ ] Unit tests for wiki CRUD operations

## Why This Matters

Transforms the DAW from "AI generates audio on demand" to "AI is a creative collaborator that remembers and builds on prior work." Every competitor (BandLab, Soundtrap, Suno) treats each generation as stateless. A compounding creative wiki would be a genuine differentiator.

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Analysis: `.llm/research/karpathy-llm-wiki-analysis.md`
BODY
)" \
  "enhancement"
echo ""

# Issue 2
echo ">>> Issue 2/6: Generation Recipe Wiki"
CREATE_ISSUE \
  "feat: Generation Recipe Wiki — compounding prompt/parameter knowledge base" \
  "$(cat <<'BODY'
## Summary

A global (not per-project) knowledge base that accumulates empirical data about what generation parameters and prompts produce good results, organized by genre/style/technique.

## Problem

ACE-Step has 16 static genre presets (`src/constants/generationPresets.ts`) — hand-curated, never updated. Meanwhile every generation session produces empirical data about what works:

- Which prompt phrases produce better results for specific genres
- Optimal CFG/steps/shift combinations per style
- Known failure modes ("shift > 5.0 with turbo model causes artifacts")
- Seed values that produce consistently good results

This knowledge is lost after every session. The 100th lo-fi generation uses the same defaults as the 1st.

## Proposed Solution

A **global generation recipe wiki** stored in IndexedDB:

```
recipe-wiki/
  index.md              — Genre/style directory
  genres/
    lo-fi-hip-hop.md    — Best prompts, parameters, known issues
    jazz.md
    synthwave.md
  techniques/
    vocal-generation.md  — Language-specific tips, prompt patterns
    stem-layering.md     — LEGO ordering strategies
    cover-strength.md    — Optimal audio_cover_strength per style
  models/
    turbo-vs-base.md     — When to use which, quality tradeoffs
  failures/
    common-artifacts.md  — Known failure modes and workarounds
```

**Ingest**: After each generation, if the user rates the result (keep/regenerate/adjust), update the relevant genre/technique page.

**Query**: When user starts a new generation, AI consults recipe wiki to suggest optimal parameters.

## Acceptance Criteria

- [ ] `RecipeWiki` service in `src/services/recipeWiki.ts`
- [ ] Auto-ingest after generation completion (with user rating signal)
- [ ] `/daw:generate` consults recipe wiki for parameter suggestions
- [ ] Recipe wiki exportable/importable (share knowledge between users)
- [ ] Genre preset generation from wiki data (replace static presets over time)
- [ ] Unit tests for ingest/query operations

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Analysis: `.llm/research/karpathy-llm-wiki-analysis.md`
BODY
)" \
  "enhancement"
echo ""

# Issue 3
echo ">>> Issue 3/6: Development Knowledge Wiki"
CREATE_ISSUE \
  "feat: Development Knowledge Wiki — structured competitive research & architecture decisions" \
  "$(cat <<'BODY'
## Summary

Apply the LLM Wiki pattern to the development process itself. Replace scattered GitHub Issues with a persistent, cross-referenced knowledge base for competitive research and architecture decisions.

## Problem

The `@researcher` agent files competitive research as one-off GitHub Issues. The `@product-manager` writes feature specs as Issues. Architecture decisions live in PR descriptions. This knowledge is:

- **Scattered** across dozens of Issues with no cross-referencing
- **Not synthesized** — nobody connects "Ableton does X" with "FL Studio does Y" into "our strategy should be Z"
- **Not maintained** — a finding from Issue #50 might contradict Issue #120, and nobody notices

## Proposed Solution

Apply the wiki pattern to `.llm/wiki/` (checked into the repo):

```
.llm/wiki/
  index.md                  — Master directory
  log.md                    — Append-only chronological record
  competitors/
    ableton-live.md         — Comprehensive, continuously updated
    fl-studio.md
    logic-pro.md
    bandlab.md
    soundtrap.md
    suno.md
  architecture/
    generation-pipeline.md  — Why it works this way, alternatives considered
    state-management.md     — Zustand store design decisions
    audio-engine.md         — Tone.js choices, limitations
  features/
    mixer.md                — Our status vs competitors, gap analysis
    timeline.md
    ai-generation.md
    midi-editing.md
  user-feedback/
    synthesis.md            — Recurring themes from user feedback
```

**Ingest**: When `@researcher` runs, update relevant wiki pages AND file Issues for actionable tasks.

**Query**: Before any feature planning, AI reads relevant wiki pages.

**Lint**: Check for stale competitive claims, missing comparisons, outdated architecture decisions.

## Acceptance Criteria

- [ ] `.llm/wiki/` directory structure created with initial pages
- [ ] `@researcher` agent updated to write findings to wiki AND file Issues
- [ ] `@product-manager` reads wiki before prioritizing
- [ ] Wiki lint command added
- [ ] All existing competitive research from GitHub Issues migrated to wiki

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Karpathy: "Human abandonment of wikis stems from maintenance burden exceeding value. LLMs don't get bored."
BODY
)" \
  "enhancement"
echo ""

# Issue 4
echo ">>> Issue 4/6: Session Memory Layer"
CREATE_ISSUE \
  "feat: Session Memory Layer — automatic ingest pipeline for wiki updates" \
  "$(cat <<'BODY'
## Summary

The technical foundation that makes all wiki features work: an automatic event capture and ingest pipeline that updates wikis without manual intervention.

## Problem

The wiki pattern only works if ingest is automatic. If we rely on manual "hey AI, update the wiki," adoption will be zero. Karpathy's key insight: the human curates sources and directs analysis; the LLM handles bookkeeping.

## Proposed Solution

A **session memory layer** that automatically captures events and ingests them:

### Generation Events (→ Recipe Wiki + Project Wiki)
```typescript
interface GenerationEvent {
  type: 'generation_complete' | 'generation_failed' | 'variation_selected'
  clipId: string
  prompt: string
  params: ClipGenerationParams
  result: 'kept' | 'regenerated' | 'adjusted' | 'deleted'
  inferredMetas?: { bpm, keyScale, genres, seed }
  userRating?: 1 | 2 | 3 | 4 | 5
}
```

### Creative Events (→ Project Wiki)
```typescript
interface CreativeEvent {
  type: 'track_added' | 'track_removed' | 'mix_adjusted' | 'arrangement_changed'
  description: string
}
```

The session memory layer batches events and triggers wiki updates at natural boundaries (after generation completes, when user pauses, on session end).

## Acceptance Criteria

- [ ] `SessionMemory` service in `src/services/sessionMemory.ts`
- [ ] Event capture hooks in generationPipeline, projectStore, transportStore
- [ ] Batch processing with configurable flush intervals
- [ ] Wiki update logic (determine which pages to touch, merge without conflicts)
- [ ] Session summary generated on session end
- [ ] Unit tests for event capture and wiki update logic

## Implementation Note

This is a **Phase 1 foundation** — Issues #1 (Project Wiki) and #2 (Recipe Wiki) depend on this ingest pipeline.

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
BODY
)" \
  "enhancement"
echo ""

# Issue 5
echo ">>> Issue 5/6: Wiki-Powered Smart Defaults"
CREATE_ISSUE \
  "feat: Wiki-Powered Smart Defaults — generation parameters from accumulated knowledge" \
  "$(cat <<'BODY'
## Summary

Use the Recipe Wiki to power **smart defaults** that improve over time, replacing static presets with empirically-derived recommendations.

## Problem

Currently, generation parameters come from:
1. Static model defaults (`src/constants/modelDefaults.ts`)
2. Static genre presets (`src/constants/generationPresets.ts`)
3. User manual adjustment

There's no learning. The 100th lo-fi generation uses the same defaults as the 1st.

## Proposed Solution

1. When user selects a genre/style, query Recipe Wiki for best-known parameters
2. Show confidence level: "Based on 47 previous generations, CFG=5.5 works best for lo-fi" vs "No data for this style yet, using defaults"
3. Track parameter-to-quality correlation over time
4. Surface discoveries: "Users who set shift=2.0 for jazz got 40% fewer regenerations"

### UI Integration
- Parameter inputs show wiki-suggested values as ghost text
- "Use recommended" button to apply wiki-derived settings
- Tooltip showing why a value was recommended

## Acceptance Criteria

- [ ] `SmartDefaults` service that queries Recipe Wiki
- [ ] Parameter suggestion UI in generation panel
- [ ] Confidence scoring based on sample size
- [ ] A/B comparison: wiki defaults vs static defaults (track regeneration rate)
- [ ] Fallback to static defaults when wiki has insufficient data

## Dependencies

- Depends on: Recipe Wiki (Issue #2), Session Memory Layer (Issue #4)

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
BODY
)" \
  "enhancement"
echo ""

# Issue 6
echo ">>> Issue 6/6: Wiki Lint & Health Dashboard"
CREATE_ISSUE \
  "feat: Wiki Lint & Health Dashboard — periodic knowledge base maintenance" \
  "$(cat <<'BODY'
## Summary

Automated lint checks for all wikis to prevent knowledge decay — contradictions, stale claims, orphan pages, and data gaps.

## Problem

Wikis decay without maintenance. Karpathy explicitly includes "Lint" as a core operation alongside Ingest and Query. Without it, wikis accumulate contradictions and stale information.

## Proposed Lint Rules

### Project Wiki Lint
- Creative brief says "minimalist" but project has 15 tracks → warning
- Generation log shows 10 failed attempts with same params → suggest parameter change
- Track notes reference deleted tracks → orphan cleanup

### Recipe Wiki Lint
- Genre page recommends CFG=7.0 but recent generations show CFG=5.0 performs better → flag for update
- Model page references deprecated model variant → stale claim
- Two genre pages give contradictory advice about the same technique → contradiction

### Dev Wiki Lint
- Competitor page cites features from 6+ months ago → staleness warning
- Architecture decision references removed code → orphan
- Feature comparison missing for recently shipped features → gap

## Acceptance Criteria

- [ ] `WikiLint` service with pluggable lint rules
- [ ] Lint results surfaced in `/daw:daw-status` output
- [ ] Auto-lint on project open (lightweight) and weekly (comprehensive)
- [ ] Lint fix suggestions (not just warnings)

## References

- [Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- Karpathy: "Lint: periodic health checks for contradictions, stale claims, orphan pages, missing concepts, and data gaps"
BODY
)" \
  "enhancement"
echo ""

echo "=== All 6 issues created! ==="
