Read the current DAW state by running the CLI:

```bash
npx tsx server/daw-cli.ts status
npx tsx server/daw-cli.ts transport
```

Display the combined output as a concise summary:
- Project name, BPM, time signature
- Track count, playing/stopped, current position
- Per-track: name, type, clip count, mute/solo, volume

The CLI returns a pre-formatted table — display it directly.
