Read the current project state using the DAW CLI.

Run these commands via Bash:
```bash
npx tsx server/daw-cli.ts status
npx tsx server/daw-cli.ts transport
```

The CLI outputs a compact summary with project name, BPM, tracks, and transport state.
If the dev server is not running, start it first with `npm run dev`.
