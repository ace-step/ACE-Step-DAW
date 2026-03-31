Analyze the current mix and suggest improvements.

1. Read mixer state: `npx tsx server/daw-cli.ts mix`
   Also read project: `npx tsx server/daw-cli.ts status`
2. Analyze:
   - Volume balance across tracks
   - Panning spread (are things centered or spread out?)
   - Mute/solo state
   - Track types and their typical level ranges
3. Suggest improvements based on genre conventions:
   - Kick and bass typically louder, centered
   - Pads and atmospheres quieter, wider stereo
   - Lead elements forward in the mix
4. Apply approved changes via CLI:
   - `npx tsx server/daw-cli.ts volume <trackId> <0-1>`
   - `npx tsx server/daw-cli.ts pan <trackId> <-1 to 1>`
   - `npx tsx server/daw-cli.ts mute <trackId>`

Display the current and proposed mix as a table for easy comparison.
