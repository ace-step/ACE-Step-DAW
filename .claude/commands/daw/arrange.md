Analyze the current arrangement and suggest improvements.

1. Read all tracks and clips:
```bash
npx tsx server/daw-cli.ts tracks
npx tsx server/daw-cli.ts status
```

2. Analyze the arrangement structure:
   - Identify empty tracks that need content
   - Find gaps between clips
   - Check if there's a clear intro/verse/chorus structure

3. Suggest improvements:
   - Fill empty tracks
   - Add transitions between sections
   - Suggest variations for repetitive parts
   - Recommend where to add builds or drops

4. Execute approved changes:
```bash
npx tsx server/daw-cli.ts add-track <type> <name>
npx tsx server/daw-cli.ts add-note <clipId> <pitch> <start> <dur> [vel]
npx tsx server/daw-cli.ts generate <prompt...>
npx tsx server/daw-cli.ts volume <trackId> <0-1>
```

Always confirm with the user before making changes.
