Interactive jam mode — build up a track collaboratively.

1. Start playback:
```bash
npx tsx server/daw-cli.ts play
```

2. Read current state:
```bash
npx tsx server/daw-cli.ts status
npx tsx server/daw-cli.ts tracks
```

3. Enter an interactive loop:
   - Suggest musical additions based on what's playing
   - Propose new MIDI patterns, drum fills, or arrangement changes
   - Wait for user approval before each change
   - Apply changes in real-time while music plays:
```bash
npx tsx server/daw-cli.ts add-track <type> <name>
npx tsx server/daw-cli.ts add-note <clipId> <pitch> <startBeat> <dur> [vel]
npx tsx server/daw-cli.ts toggle-step <trackId> <rowId> <step>
npx tsx server/daw-cli.ts generate <prompt...>
```

Keep suggestions musical and contextual:
- Match the project BPM and key
- Suggest complementary parts (if drums exist, suggest bass next)
- Offer variations and fills at natural transition points
- Keep the energy arc in mind (build up, peak, release)
