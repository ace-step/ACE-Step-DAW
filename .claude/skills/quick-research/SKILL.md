# Quick Research Skill

> Lightweight inline research protocol for agents during development.
> NOT a full research cycle — just targeted web searches to inform immediate decisions.
> Use when you hit uncertainty, not as a default step.

## When to Trigger (Research Signals)

Pause and research when you encounter ANY of these:

1. **Unfamiliar UI pattern** — Building something you haven't seen in this codebase before (e.g., a new type of control, visualization, or interaction)
2. **DAW convention uncertainty** — Unsure how professional DAWs handle a specific workflow (e.g., "how does solo work across groups?", "what's the standard for automation curve editing?")
3. **Design pattern doubt** — Multiple valid approaches exist and you're not sure which is idiomatic for DAWs (e.g., "should this be a modal or inline editor?")
4. **Accessibility/UX gap** — Building for a use case where you're unsure of best practices (e.g., keyboard navigation for piano roll, screen reader for mixer)
5. **API/library uncertainty** — Using Tone.js, Web Audio, or other APIs in unfamiliar ways
6. **Performance concern** — Need to know the right approach for a performance-sensitive feature (e.g., canvas vs DOM for waveforms, virtualization strategies)

## Protocol (2-5 minutes, not 30)

### Step 1: Frame the Question
Write a single clear question. Bad: "how do DAWs work?" Good: "how does Ableton Live handle automation breakpoint editing — click to add, drag to move, what modifier keys?"

### Step 2: Search (2-3 queries max)
```
WebSearch: "<specific question> site:ableton.com OR site:bitwig.io OR site:image-line.com"
WebSearch: "<pattern name> best practice <framework>"
```

### Step 3: Extract and Apply
- Read the top 1-2 results (WebFetch if needed)
- Extract ONLY what's relevant to your current task
- Note the source in a code comment if the insight significantly shaped your implementation

### Step 4: Return to Work
Do NOT go down rabbit holes. You have what you need — get back to coding.

## Anti-Patterns

- **Research as procrastination**: Don't search for things you already know
- **Rabbit holes**: Stop at 3 queries. If you haven't found what you need, make a reasonable decision and move on
- **Copy-paste architecture**: Research informs decisions, it doesn't replace thinking
- **Ignoring local context**: Always check how this codebase already handles similar things BEFORE searching externally
- **Full research cycle**: If you need 10+ queries, you need the `@researcher` agent, not quick-research

## Search Query Templates

### DAW Conventions
```
"<DAW name> <feature> workflow" (e.g., "Ableton Live automation editing workflow")
"<DAW name> <feature> keyboard shortcuts"
"<DAW name> <feature> documentation"
```

### UI/UX Patterns
```
"<pattern> best practice web audio" (e.g., "waveform rendering best practice web audio")
"<component type> accessibility WAI-ARIA" (e.g., "slider accessibility WAI-ARIA")
"<interaction> UX pattern desktop app" (e.g., "drag and drop UX pattern desktop app")
```

### Technical Implementation
```
"<library> <feature> example" (e.g., "Tone.js effects chain example")
"<problem> performance React" (e.g., "canvas rendering performance React")
"<API> browser support caniuse" (e.g., "Web MIDI API browser support caniuse")
```

## Integration with Other Skills

- If quick-research reveals a major gap → flag it for `@researcher` agent
- If research findings affect design → reference them in your design-review
- If you discover a better pattern than what exists → note it but don't refactor unless it's your current task
