Read the current DAW project state and display a concise summary.

Run these commands and present the combined output:

```bash
npx tsx server/daw-cli.ts status
npx tsx server/daw-cli.ts transport
```

Display:
- Project name, BPM, time signature
- Playing/stopped, current position, loop state
- Track table: name, type, clip count, volume, mute/solo
