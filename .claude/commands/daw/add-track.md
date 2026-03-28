Add a new track to the DAW project.

Ask the user what kind of track they want if not specified:
- **stems**: Audio track for AI-generated music (most common)
- **sample**: For audio samples and loops
- **sequencer**: Step sequencer for drum patterns
- **pianoroll**: MIDI track with piano roll editor

Use the daw_add_track tool with the chosen type.
If the user describes a musical purpose (e.g. "drums", "bass", "vocals"), suggest the appropriate track type and set a matching name.
