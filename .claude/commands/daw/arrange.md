Analyze the current arrangement and suggest improvements.

1. Read all tracks and clips: `npx tsx server/daw-cli.ts tracks`
2. Analyze the arrangement structure:
   - Identify empty tracks that need content
   - Find gaps between clips
   - Check if there's a clear intro/verse/chorus structure
3. Suggest improvements:
   - Fill empty tracks
   - Add transitions between sections
   - Suggest variations for repetitive parts
   - Recommend where to add builds or drops
4. Execute approved changes via CLI:
   - `npx tsx server/daw-cli.ts add-track <type> [name]`
   - `npx tsx server/daw-cli.ts midi <clipId> <pitch> <start> <dur> [vel]`

Always confirm with the user before making changes.
