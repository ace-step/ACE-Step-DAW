Help the user generate AI music in the DAW.

1. Read current project state:
```bash
npx tsx server/daw-cli.ts status
```

2. Ask the user for a text prompt describing the music they want

3. Determine the best track, or create a new stems track:
```bash
npx tsx server/daw-cli.ts add-track stems "Track Name"
```

4. Trigger generation with the prompt:
```bash
npx tsx server/daw-cli.ts generate <prompt text...>
```

Tips for good generation prompts:
- Be specific: "upbeat lo-fi hip hop beat with jazzy piano chords and vinyl crackle"
- Include tempo context: the project BPM affects the generation
- Describe the role: "bass line", "drum pattern", "ambient pad"
