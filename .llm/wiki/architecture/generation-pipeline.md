# Generation Pipeline Architecture

> Last updated: 2026-04-05

## Overview

The generation pipeline (`src/services/generationPipeline.ts`, ~108KB) is the largest
service in the codebase. It orchestrates all AI music generation workflows.

## Generation Types

| Type | Description | API Task |
|------|------------|----------|
| text2music | Full song from prompt | `releaseLegoTask` with text2music params |
| lego | Single track in context | `releaseLegoTask` with context window |
| cover | Style transfer / re-sing | `releaseLegoTask` with cover params |
| repaint | Modify existing audio | `releaseLegoTask` with repaint params |

## Data Flow

```
User Input (prompt, params)
  → generationPipeline.generateClipInternal()
    → aceStepApi.releaseLegoTask() (submit to backend)
    → poll aceStepApi.queryResult() every 2s
    → aceStepApi.downloadAudio() on completion
    → decode audio → store in projectStore
    → save blob via audioFileManager (IndexedDB)
```

## Key Patterns

- **Context Window**: Lego mode sends relative offset ranges to backend
- **Clip Versioning**: Each generation creates a ClipVersion snapshot
- **Progress Tracking**: ETA computed from polling velocity
- **Cumulative Audio**: Multi-track blobs accumulated for context

## Wiki Integration (new)

- SessionMemory captures generation events
- RecipeWiki ingests events for parameter learning
- ProjectWiki logs per-project generation history
- SmartDefaults queries wiki for recommendations
