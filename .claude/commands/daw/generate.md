Help the user generate AI music in the DAW.

1. Read current project state with daw_get_project
2. Ask the user for a text prompt describing the music they want
3. Determine the best track to generate on, or create a new stems track with daw_add_track
4. Use concrete prompt guidance: genre, mood, instruments, energy level
5. Report when the generation is set up

Tips for good generation prompts:
- Be specific: "upbeat lo-fi hip hop beat with jazzy piano chords and vinyl crackle"
- Include tempo context: the project BPM affects the generation
- Describe the role: "bass line", "drum pattern", "ambient pad"
