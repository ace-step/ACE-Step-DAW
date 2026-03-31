# Quick Research Skill

> Lightweight inline research protocol for agents who need to look something up
> mid-task without derailing into a full research cycle.
>
> **Use this when**: You hit an unknown API, unfamiliar pattern, or need to verify
> a technical approach — and the answer is findable in 2-3 searches.
>
> **Don't use this when**: You need to compare 5+ competitors, analyze a market,
> or produce a research document. Use `@researcher` or `/research-cycle` instead.

## When to Trigger

1. **Unknown API**: You're about to call a function you haven't used before
2. **Error loop**: You've failed the same thing twice — stop guessing, search
3. **Best practice question**: "Is there a better way to do X in React/Tone.js?"
4. **Competitor behavior**: "How does Ableton handle this specific interaction?"
5. **Edge case uncertainty**: "What happens when the sample rate changes mid-playback?"

## Protocol (3 steps, under 2 minutes)

### Step 1: Frame the Question (10 seconds)

Write a single sentence: "I need to know [X] because [Y]."

Bad: "Research Web Audio API"
Good: "I need to know if AudioContext.resume() is needed after tab visibility change because our playback breaks when users switch tabs"

### Step 2: Search (2-3 queries max)

Use WebSearch with targeted queries:
- Include the specific API/library name
- Include the specific problem or behavior
- Add "2024" or "2025" for recent results if the API may have changed

Example queries:
```
"AudioContext resume tab visibility change 2025"
"Tone.js Transport sync drift workaround"
"React 19 useEffect cleanup race condition"
```

If the first result answers your question, stop. Don't search for confirmation.

### Step 3: Extract and Apply (30 seconds)

From the search results, extract:
- **The answer** (1-2 sentences)
- **The source** (URL for reference)
- **Any gotcha** (common mistake to avoid)

Then immediately return to your task. Don't write a research document.

## Anti-Patterns

- **Research rabbit hole**: 5+ searches on a tangent. If 3 searches don't answer it, escalate to `@researcher`.
- **Confirmation searching**: You already know the answer but keep searching to "make sure." Trust the first credible source.
- **Over-documenting**: Writing a research summary for a simple API lookup. Just use the knowledge and move on.
- **Searching for things in the codebase**: If the answer is in the project files, use Grep/Read, not WebSearch.

## Output (inline, not a separate document)

No formal output. The research result gets applied directly to your current task.
If the finding is surprising or non-obvious, add a brief code comment:
```typescript
// Note: AudioContext must be resumed after tab visibility change (Chrome policy)
await Tone.context.resume();
```
