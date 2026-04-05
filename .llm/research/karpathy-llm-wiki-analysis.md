# Karpathy's LLM Wiki Pattern — Analysis for ACE-Step DAW

> Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
> Date: 2026-04-05
> Author: Claude (analysis session)

## Core Insight

Karpathy proposes that LLMs should **incrementally build and maintain a persistent wiki** — a structured markdown knowledge base that **compounds over time** — instead of re-deriving knowledge from scratch each session (as RAG does).

Three-layer architecture:
1. **Raw Sources** — Immutable curated documents
2. **The Wiki** — LLM-generated markdown pages (summaries, entity pages, concept pages, synthesis)
3. **The Schema** — Configuration defining wiki structure and conventions (e.g., CLAUDE.md)

Core operations: **Ingest** (process new sources → update 10-15 wiki pages), **Query** (search wiki → synthesize → file important answers back), **Lint** (periodic health checks for contradictions, stale claims, gaps).

## Why This Matters for ACE-Step DAW

### The Problem: Knowledge Doesn't Compound

ACE-Step DAW has an excellent **process-oriented** skill system (music-theory-engine, compose, strudel-maestro) that teaches "how to research" rather than memorizing facts. This is philosophically sound.

But the **output of that research is lost between sessions**:

- When `/compose` researches jazz harmony, those findings evaporate after the session
- When a user discovers that `CFG=5.0 + shift=2.5` produces excellent lo-fi results, that insight is lost
- When `@researcher` analyzes Ableton's mixer, findings go into one-off GitHub Issues (no cross-referencing, no synthesis)
- When the AI helps compose a 10-track project over multiple sessions, it has zero memory of prior creative decisions

The wiki pattern would make **every research action, every generation experiment, every creative decision compound** into a persistent knowledge base that makes every subsequent session smarter.

### The Opportunity: ACE-Step Already Has Layer 3

Karpathy's "Schema" layer = the configuration that defines wiki structure. ACE-Step already has this:
- `CLAUDE.md` + `AGENTS.md` = development schema
- `.claude/skills/` = process schemas for music research
- `.claude/references/` = design/interaction schemas
- `.claude/daw-system-prompt.md` = AI assistant schema

**What's missing is Layer 2 — the wiki itself.** The persistent, LLM-maintained knowledge pages that compound over time.

## Proposed Issues

---

### Issue 1: `feat: Project Creative Wiki — persistent per-project knowledge base`

**Priority: P1** | **Label: enhancement**

#### Problem
Each DAW project has only basic metadata (BPM, key, globalCaption). When an AI assistant helps compose music across multiple sessions, it has no memory of:
- Why the user chose a particular genre direction
- What reference tracks inspired the project
- Which generation parameters produced the best results
- Mix decisions and their rationale
- Lyric themes, narrative arc, character voice

#### Proposed Solution
Add a **per-project wiki** (stored in IndexedDB alongside the project) that the AI maintains. Structure:

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

**Ingest trigger**: After every generation, cover, or repaint operation, the AI updates relevant wiki pages with what was tried and what worked.

**Query trigger**: When starting a new session with an existing project, the AI reads the wiki first to restore creative context.

**Lint trigger**: When user runs `/daw:mix` or `/daw:arrange`, cross-check wiki for contradictions (e.g., "creative brief says 'minimal' but 12 tracks added").

#### Acceptance Criteria
- [ ] `ProjectWiki` type added to `src/types/project.ts`
- [ ] Wiki pages stored in IndexedDB under `wiki:<projectId>:<pageName>`
- [ ] Generation pipeline auto-updates `generation-log.md` after successful generation
- [ ] `/daw:daw-status` reads and summarizes project wiki
- [ ] Wiki included in `.acedaw` archive export
- [ ] Unit tests for wiki CRUD operations

#### Why This Matters
This is the highest-leverage application of the wiki pattern. It transforms the DAW from "AI generates audio on demand" to "AI is a creative collaborator that remembers and builds on prior work." Every competitor (BandLab, Soundtrap, Suno) treats each generation as stateless. A compounding creative wiki would be a genuine differentiator.

---

### Issue 2: `feat: Generation Recipe Wiki — compounding prompt/parameter knowledge base`

**Priority: P1** | **Label: enhancement**

#### Problem
ACE-Step has 16 genre presets in `src/constants/generationPresets.ts` — static, hand-curated, never updated. Meanwhile, every generation session produces empirical data about what works:
- Which prompt phrases produce better results for specific genres
- Optimal CFG/steps/shift combinations per style
- Known failure modes ("shift > 5.0 with turbo model causes artifacts")
- Seed values that produce consistently good starting points

This knowledge is currently lost after every session.

#### Proposed Solution
A **global generation recipe wiki** (stored in IndexedDB, not per-project) that the AI maintains:

```
recipe-wiki/
  index.md              — Genre/style directory
  genres/
    lo-fi-hip-hop.md    — Best prompts, parameters, known issues
    jazz.md
    synthwave.md
    ...
  techniques/
    vocal-generation.md  — Language-specific tips, prompt patterns
    stem-layering.md     — LEGO ordering strategies
    cover-strength.md    — Optimal audio_cover_strength per style
  models/
    turbo-vs-base.md     — When to use which, quality tradeoffs
    sft-specialties.md   — What SFT excels at
  failures/
    common-artifacts.md  — Known failure modes and workarounds
```

**Ingest**: After each generation, if the user rates the result (keep/regenerate/adjust), update the relevant genre/technique page.

**Query**: When user starts a new generation, AI consults recipe wiki to suggest optimal parameters.

**Lint**: Weekly check for contradictory recommendations, outdated model info.

#### Acceptance Criteria
- [ ] `RecipeWiki` service in `src/services/recipeWiki.ts`
- [ ] Auto-ingest after generation completion (with user rating signal)
- [ ] `/daw:generate` consults recipe wiki for parameter suggestions
- [ ] Recipe wiki exportable/importable (share knowledge between users)
- [ ] Genre preset generation from wiki data (replace static presets over time)
- [ ] Unit tests for ingest/query/lint operations

#### Why This Matters
This turns every user's generation experiments into a compounding knowledge base. Over 100 generations, the AI should know far more about what works than any static preset file. This is the "LLMs don't get bored, don't forget to update a cross-reference" insight applied to music production.

---

### Issue 3: `feat: Development Knowledge Wiki — persistent competitive research & architecture decisions`

**Priority: P2** | **Label: enhancement**

#### Problem
The `@researcher` agent files competitive research as one-off GitHub Issues. The `@product-manager` writes feature specs as Issues. Architecture decisions live in PR descriptions. This knowledge is:
- **Scattered** across dozens of Issues with no cross-referencing
- **Not synthesized** — nobody connects "Ableton does X" with "FL Studio does Y" into "our strategy should be Z"
- **Not maintained** — a finding from Issue #50 might contradict Issue #120, and nobody notices

#### Proposed Solution
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

**Ingest**: When `@researcher` runs, instead of (only) filing an Issue, it updates the relevant wiki pages. Issues still get filed for actionable tasks, but knowledge goes to the wiki.

**Query**: Before any feature planning, AI reads relevant wiki pages for context.

**Lint**: `@refactorer` or `@tester` can run wiki lint to find stale competitive claims, missing feature comparisons, architecture decisions that no longer apply.

#### Acceptance Criteria
- [ ] `.llm/wiki/` directory structure created with initial pages
- [ ] `@researcher` agent updated to write findings to wiki AND file Issues
- [ ] `@product-manager` agent reads wiki before prioritizing
- [ ] Wiki lint command added (check for staleness, contradictions)
- [ ] All existing competitive research from GitHub Issues migrated to wiki

#### Why This Matters
Karpathy's core insight: "Human abandonment of wikis stems from maintenance burden exceeding value. LLMs don't get bored." The `@researcher` agent already does the research — it just dumps findings into Issues and moves on. Routing that knowledge into a maintained wiki costs almost nothing but makes every future research cycle smarter.

---

### Issue 4: `feat: Session Memory Layer — automatic ingest pipeline for wiki updates`

**Priority: P1** | **Label: enhancement**

#### Problem
The wiki pattern only works if **ingest is automatic**. If we rely on manual "hey AI, update the wiki," adoption will be zero. The key insight from Karpathy: the human curates sources and directs analysis; the LLM handles bookkeeping.

#### Proposed Solution
A **session memory layer** that automatically captures and ingests events into the appropriate wiki:

**Generation Events** (→ Recipe Wiki + Project Wiki):
```typescript
interface GenerationEvent {
  type: 'generation_complete' | 'generation_failed' | 'variation_selected'
  clipId: string
  prompt: string
  params: ClipGenerationParams
  result: 'kept' | 'regenerated' | 'adjusted' | 'deleted'
  inferredMetas?: { bpm, keyScale, genres, seed }
  userRating?: 1 | 2 | 3 | 4 | 5  // optional explicit rating
}
```

**Creative Events** (→ Project Wiki):
```typescript
interface CreativeEvent {
  type: 'track_added' | 'track_removed' | 'mix_adjusted' | 'arrangement_changed'
  description: string  // AI-generated summary of what changed and why
}
```

**Research Events** (→ Dev Wiki):
```typescript
interface ResearchEvent {
  type: 'competitor_analysis' | 'api_discovery' | 'user_feedback'
  source: string
  findings: string[]
}
```

The session memory layer batches events and triggers wiki updates at natural boundaries (after generation completes, when user pauses, on session end).

#### Acceptance Criteria
- [ ] `SessionMemory` service in `src/services/sessionMemory.ts`
- [ ] Event capture hooks in generationPipeline, projectStore, transportStore
- [ ] Batch processing with configurable flush intervals
- [ ] Wiki update logic (determine which pages to touch, merge without conflicts)
- [ ] Session summary generated on session end
- [ ] Unit tests for event capture and wiki update logic

---

### Issue 5: `feat: Wiki-Powered Smart Defaults — generation parameters from accumulated knowledge`

**Priority: P2** | **Label: enhancement**

#### Problem
Currently, generation parameters come from:
1. Static model defaults (`src/constants/modelDefaults.ts`)
2. Static genre presets (`src/constants/generationPresets.ts`)
3. User manual adjustment

There's no learning. The 100th lo-fi generation uses the same defaults as the 1st.

#### Proposed Solution
Use the Recipe Wiki (Issue 2) to power **smart defaults** that improve over time:

1. When user selects a genre/style, query Recipe Wiki for best-known parameters
2. Show confidence level: "Based on 47 previous generations, CFG=5.5 works best for lo-fi" vs "No data for this style yet, using defaults"
3. Track parameter-to-quality correlation over time
4. Surface "discoveries": "Users who set shift=2.0 for jazz got 40% fewer regenerations"

**UI Integration**:
- Parameter inputs show wiki-suggested values as ghost text
- "Use recommended" button to apply wiki-derived settings
- Tooltip showing why a value was recommended

#### Acceptance Criteria
- [ ] `SmartDefaults` service that queries Recipe Wiki
- [ ] Parameter suggestion UI in generation panel
- [ ] Confidence scoring based on sample size
- [ ] A/B comparison: wiki defaults vs static defaults (track regeneration rate)
- [ ] Fallback to static defaults when wiki has insufficient data

---

### Issue 6: `feat: Wiki Lint & Health Dashboard — periodic knowledge base maintenance`

**Priority: P3** | **Label: enhancement**

#### Problem
Wikis decay without maintenance. Karpathy explicitly includes "Lint" as a core operation. Without it, the wiki will accumulate contradictions, stale claims, and orphan pages.

#### Proposed Solution
Automated lint checks that can run on-demand or periodically:

**Project Wiki Lint**:
- Creative brief says "minimalist" but project has 15 tracks → warning
- Generation log shows 10 failed attempts with same params → suggest parameter change
- Track notes reference deleted tracks → orphan cleanup

**Recipe Wiki Lint**:
- Genre page recommends CFG=7.0 but recent generations show CFG=5.0 performs better → flag for update
- Model page references deprecated model variant → stale claim
- Two genre pages give contradictory advice about the same technique → contradiction

**Dev Wiki Lint**:
- Competitor page cites features from 6+ months ago → staleness warning
- Architecture decision references removed code → orphan
- Feature comparison missing for recently shipped features → gap

#### Acceptance Criteria
- [ ] `WikiLint` service with pluggable lint rules
- [ ] Lint results surfaced in `/daw:daw-status` output
- [ ] Auto-lint on project open (lightweight) and weekly (comprehensive)
- [ ] Lint fix suggestions (not just warnings)

---

## Implementation Priority & Sequencing

```
Phase 1 (Foundation):
  Issue 4: Session Memory Layer  ← The plumbing everything else needs
  Issue 2: Recipe Wiki           ← Highest immediate value, smallest scope

Phase 2 (User-Facing):
  Issue 1: Project Creative Wiki ← Biggest differentiator
  Issue 5: Smart Defaults        ← Makes the recipe wiki visible to users

Phase 3 (Development):
  Issue 3: Dev Knowledge Wiki    ← Improves dev process
  Issue 6: Wiki Lint             ← Keeps everything healthy
```

## Connection to Existing Architecture

| Karpathy Layer | ACE-Step Equivalent | Status |
|---|---|---|
| Raw Sources | Audio blobs in IDB, generation params, user prompts | ✅ Exists |
| The Schema | CLAUDE.md, skills, references, agents | ✅ Exists |
| The Wiki | — | ❌ Missing |
| Ingest | — | ❌ Missing |
| Query | Skills do live research (no persistent store) | 🔶 Partial |
| Lint | — | ❌ Missing |

## Key Design Principle

From Karpathy: *"The human curates sources and directs analysis; the LLM handles bookkeeping."*

Applied to ACE-Step: **The user makes music and creative decisions; the AI maintains the knowledge base that makes each decision better-informed than the last.**

This is NOT about replacing the process-oriented skills (music-theory-engine, compose, strudel-maestro). Those are excellent — they teach HOW to research. The wiki gives those skills a MEMORY, so research compounds instead of evaporating.
