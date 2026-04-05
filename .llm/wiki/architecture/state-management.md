# State Management Architecture

> Last updated: 2026-04-05

## Zustand Stores

| Store | Size | Purpose |
|-------|------|---------|
| projectStore | 332KB | Main project state: tracks, clips, effects, routing |
| uiStore | 60KB | UI panels, selections, collapsed regions |
| generationStore | 39KB | Generation job tracking, progress, variations |
| modelStore | 8KB | Model inventory and active model |
| sessionStore | 8KB | Session/clip launcher state |
| chordSuggestionStore | 4.5KB | Chord progression and suggestions |
| midiAiStore | 7KB | MIDI generation and playback |

## Patterns

- Stores use `create()` from Zustand 5
- Actions are defined inline: `set((state) => ({ ... }))`
- External access: `useStore.getState()` from services
- Persistence: `persist` middleware on projectStore and generationStore

## Access Convention

- Components: `useStore(selector)` for reactive subscriptions
- Services: `useStore.getState()` for imperative access
- Testing: `window.__store` for CLI/E2E testing
