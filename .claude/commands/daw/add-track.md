Add a new track to the DAW project.

Ask the user what kind of track they want if not specified:
- **stems**: Audio track for AI-generated music (most common)
- **sample**: For audio samples and loops
- **sequencer**: Step sequencer for drum patterns
- **pianoroll**: MIDI track with piano roll editor

Use the CLI: `npx tsx server/daw-cli.ts add-track <type> [name]`
If the user describes a musical purpose (e.g. "drums", "bass", "vocals"), suggest the appropriate track type and set a matching name.
