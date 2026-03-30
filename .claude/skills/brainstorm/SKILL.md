# Brainstorm Exploration Skill

> Explore multiple solution approaches before committing to one.
> Depth (grinding on one solution) gives precision. Breadth (exploring alternatives) finds the global optimum.
> Use both together.

## When to Trigger (Exploration Signals)

Pause and brainstorm when you encounter ANY of these:

1. **Non-trivial architecture decision** — The task touches 3+ files or introduces a new pattern
2. **Multiple valid approaches** — You can think of 2+ ways to solve it and aren't sure which is better
3. **Performance-sensitive feature** — Wrong approach could cause jank, memory issues, or audio glitches
4. **User-facing interaction design** — The interaction pattern will be hard to change later once users learn it
5. **Integration point** — Connecting systems (store ↔ engine, UI ↔ API) where the interface contract matters
6. **Stuck for 10+ minutes** — If grinding isn't working, step back and explore

## Protocol

### Phase 1: Diverge (Generate Options)

List **3 distinct approaches** minimum. For each:

```markdown
### Approach A: <name>
- **How**: One-paragraph description of the implementation
- **Pros**: What's good about this approach
- **Cons**: What's risky or limiting
- **Effort**: Low / Medium / High
- **Precedent**: How do competitors or similar projects do it? (use WebSearch if needed)
```

Rules for diverging:
- Force yourself to 3+ options even if one seems obviously best
- Include at least one "unconventional" approach
- Don't evaluate while generating — just list them
- Use WebSearch to discover approaches you haven't considered:
  ```
  WebSearch: "<problem domain> approaches comparison"
  WebSearch: "how does <competitor> implement <feature>"
  ```

### Phase 2: Evaluate (Compare Tradeoffs)

Create a comparison matrix:

```markdown
| Criterion          | Approach A | Approach B | Approach C |
|--------------------|-----------|-----------|-----------|
| Fits existing code | ✅/⚠️/❌   |           |           |
| Testability        |           |           |           |
| Performance        |           |           |           |
| User experience    |           |           |           |
| Maintenance cost   |           |           |           |
| Reversibility      |           |           |           |
```

Key evaluation principles:
- **Fits existing code** is heavily weighted — don't fight the architecture
- **Reversibility** matters — prefer approaches that are easy to change later
- **User experience** outweighs implementation elegance
- Check competitors: `WebSearch: "<feature> UX <competitor DAW>"`

### Phase 3: Converge (Decide and Document)

Pick one approach. Write a brief decision record:

```markdown
**Decision**: Approach B — <name>
**Reason**: <1-2 sentences on why this wins>
**Tradeoff accepted**: <what we're giving up>
**Revisit if**: <condition that would make us reconsider>
```

Then implement with confidence. No second-guessing during implementation.

## Lightweight Mode (for smaller decisions)

Not every decision needs the full protocol. For smaller choices:

1. Think of 2 approaches (10 seconds)
2. Pick the one that fits existing patterns better
3. Move on

Use the full protocol only when the exploration signals above are strong.

## Anti-Patterns

- **Analysis paralysis**: 3 approaches, not 10. Decide in under 5 minutes.
- **Brainstorming as avoidance**: If you're exploring because implementation is hard, that's not brainstorming — that's procrastination. Do the hard thing.
- **Ignoring the winner**: Once you've decided, commit. Don't keep revisiting.
- **Over-engineering the exploration**: A markdown table in your head is fine. Don't write a 500-line document.
- **Solo-diverging**: If WebSearch can show you how others solved this, use it. Your imagination alone is limited.

## Integration with Development Flow

```
Task received
  → Is it trivial? → Just do it
  → Non-trivial? → Brainstorm (this skill)
     → Pick approach → Quick-research specifics (quick-research skill)
        → Implement with TDD → Review
```
