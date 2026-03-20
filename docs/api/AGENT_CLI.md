# Agent CLI

`window.__agentCli` is the official command runtime for agent-first automation in ACE-Step DAW.

## Surfaces

- `window.__agentCli`: canonical execution surface for commands
- `window.__store`: low-level state inspection and advanced setup
- `window.__actionApi`: structured domain helpers used by the CLI runtime
- `npm run daw:cli -- ...`: terminal wrapper around the browser runtime

## Core Commands

### Project

- `project.create`
- `project.open`
- `project.summary`

### Transport

- `transport.play`
- `transport.pause`
- `transport.stop`
- `transport.record.toggle`
- `transport.loop.toggle`
- `transport.metronome.toggle`

### Tracks and Clips

- `track.add`
- `track.add.drums`
- `track.add.bass`
- `track.add.piano`
- `track.add.sampler`
- `track.add.drumMachine`
- `track.select`
- `track.list`
- `clip.createMidi`
- `clip.cover.open`
- `clip.select`
- `clip.list`

### Editors and Panels

- `pianoroll.open`
- `pianoroll.note.add`
- `pianoroll.note.resize`
- `pianoroll.tool.set`
- `sequencer.open`
- `sequencer.step.toggle`
- `sequencer.pattern.inspect`
- `panel.toggle`
- `panel.toggle.library`
- `panel.toggle.mixer`
- `panel.toggle.smartControls`
- `panel.toggle.generation`
- `panel.toggle.commandPalette`
- `panel.toggle.loopBrowser`
- `panel.toggle.tempoLane`
- `panel.toggle.aiAssistant`

### Post-Production Copilot

- `postProduction.open`
- `postProduction.startRepair`
- `postProduction.startExtend`
- `postProduction.startPolish`
- `postProduction.getTaskState`
- `postProduction.runNextStep`

## Result Contract

Every command returns:

```ts
type AgentCliCommandResult =
  | { ok: true; commandId: string; timestamp: number; value: unknown }
  | {
      ok: false;
      commandId: string;
      timestamp: number;
      error: {
        code: string;
        message: string;
        context: Record<string, unknown>;
        recoverySuggestions: Array<{
          action: string;
          label: string;
          params?: Record<string, unknown>;
        }>;
      };
    };
```

Common error codes:

- `PROJECT_REQUIRED`
- `TRACK_NOT_FOUND`
- `CLIP_NOT_FOUND`
- `MIDI_CLIP_REQUIRED`
- `SEQUENCER_ROW_NOT_FOUND`
- `STEP_INDEX_OUT_OF_RANGE`
- `COMMAND_NOT_FOUND`
- `INVALID_ARGUMENTS`
- `AUDIO_SOURCE_REQUIRED`
- `TIME_RANGE_REQUIRED`
- `POST_PRODUCTION_TASK_NOT_READY`

## Terminal Usage

```bash
npm run daw:cli -- list
npm run daw:cli -- describe track.add
npm run daw:cli -- exec project.create --arg name="CLI Demo" --arg bpm=128
npm run daw:cli -- exec track.add --arg trackName=keyboard --arg trackType=pianoRoll
npm run daw:cli -- exec postProduction.open --arg taskType=repair
npm run daw:cli -- copilot-open repair
npm run daw:cli -- copilot-repair --arg clipId=clip-123 --arg startTime=12 --arg endTime=15
npm run daw:cli -- copilot-extend --arg trackIds='[\"track-1\"]' --arg startTime=16 --arg endTime=24
npm run daw:cli -- copilot-polish --arg preset=balanced --arg loudnessTarget=-14
npm run daw:cli -- cover-open --arg clipId=clip-123
npm run daw:cli -- batch ./workflow.json
```

Set `ACE_STEP_DAW_URL` or pass `--url` to point the CLI at a local running app instance.

## Workflow Recipes

### Create project -> piano track -> MIDI clip -> note -> play

```json
[
  { "id": "project.create", "args": { "name": "Melody Draft", "bpm": 128 } },
  { "id": "track.add.piano" },
  { "id": "track.list" },
  { "id": "clip.createMidi", "args": { "trackId": "<TRACK_ID>", "startTime": 0, "duration": 4 } },
  { "id": "pianoroll.note.add", "args": { "clipId": "<CLIP_ID>", "pitch": 60, "startBeat": 0, "durationBeats": 1, "velocity": 0.8 } },
  { "id": "transport.play" }
]
```

### Create sequencer track -> toggle beat -> inspect pattern

```json
[
  { "id": "project.create", "args": { "name": "Beat Draft", "bpm": 120 } },
  { "id": "track.add", "args": { "trackName": "drums", "trackType": "sequencer" } },
  { "id": "track.list" },
  { "id": "sequencer.step.toggle", "args": { "trackId": "<TRACK_ID>", "rowId": "<ROW_ID>", "stepIndex": 0 } },
  { "id": "sequencer.pattern.inspect", "args": { "trackId": "<TRACK_ID>" } }
]
```

### Open agent-facing UI surfaces

```json
[
  { "id": "panel.toggle.library" },
  { "id": "panel.toggle.mixer" },
  { "id": "panel.toggle.commandPalette" }
]
```

### Repair -> extend -> inspect task state

```json
[
  { "id": "project.create", "args": { "name": "Copilot Draft", "bpm": 122 } },
  { "id": "postProduction.open", "args": { "taskType": "repair" } },
  { "id": "postProduction.getTaskState" },
  { "id": "postProduction.open", "args": { "taskType": "extend" } },
  { "id": "postProduction.getTaskState" }
]
```
