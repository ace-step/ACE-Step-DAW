# midi-strudel Integration Notes

## Source Studied

- Upstream repo: `beejsbj/midi-strudel`
- ACE-Step mainline around `d193945`
- Open PR reference seam: `#784`

## Key Findings

- `midi-strudel` is best treated as a converter/workbench, not as a synchronized dual-editor system.
- ACE-Step already has:
  - MIDI clips and piano-roll editing
  - MIDI file parsing in `src/utils/midi.ts`
  - Strudel tracks and a Strudel editor panel
- The lowest-friction product fit is one-way `MIDI -> Strudel`.

## Design Decisions

- Reimplement the converter in ACE-Step instead of copying upstream code.
- Reuse ACE-Step data structures for clips, tracks, BPM, and key scale.
- Route imported/generated code into the existing Strudel editor and Strudel tracks.
- Keep v1 non-destructive:
  - source MIDI stays untouched
  - converted Strudel code is applied to a Strudel track

## Conflict Notes

- Recent main already touched toolbar/track-header UI, so this feature avoids toolbar-first integration.
- PR `#784` changes Strudel-related files and removes Strudel from the add-track picker, so this work follows that direction:
  - Strudel remains a dedicated panel workflow
  - conversion is exposed from MIDI surfaces and inside Strudel editor
