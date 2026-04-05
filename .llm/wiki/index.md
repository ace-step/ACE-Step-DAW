# ACE-Step DAW Development Wiki

> Persistent knowledge base for competitive research and architecture decisions.
> Maintained by AI agents using the LLM Wiki pattern.
> @see https://github.com/ace-step/ACE-Step-DAW/issues/1455

## Directory Structure

- `log.md` — Chronological append-only record of all findings
- `competitors/` — Per-competitor analysis pages
  - `ableton-live.md` — Ableton Live 12 feature analysis
  - `fl-studio.md` — FL Studio interaction patterns
  - `logic-pro.md` — Logic Pro design decisions
  - `bandlab.md` — BandLab (web DAW competitor)
  - `soundtrap.md` — Soundtrap (web DAW competitor)
  - `suno.md` — Suno (AI music competitor)
- `architecture/` — System architecture decisions
  - `generation-pipeline.md` — AI generation pipeline architecture
  - `state-management.md` — Zustand store design
  - `audio-engine.md` — Tone.js and Web Audio architecture
- `features/` — Feature-level knowledge
  - `mixer.md` — Mixer design and interaction patterns
  - `timeline.md` — Timeline/arrangement view decisions
  - `ai-generation.md` — AI music generation UX
  - `midi-editing.md` — Piano roll and MIDI editing
- `user-feedback/` — Aggregated user feedback themes

## Usage

### For @researcher agent
```
1. Search competitor docs at interaction-detail level
2. Write findings to the relevant wiki page
3. Also file a GitHub Issue with a summary
```

### For @product-manager agent
```
1. Read relevant wiki pages before prioritizing
2. Cross-reference competitor approaches
3. Update wiki when decisions are made
```

### Wiki Conventions
- Each page starts with a `# Title` and `> Last updated: YYYY-MM-DD`
- Findings include source URLs
- Contradictions are flagged with `⚠️ CONFLICT` markers
- Stale claims (>6 months) are flagged with `⏰ STALE` markers
