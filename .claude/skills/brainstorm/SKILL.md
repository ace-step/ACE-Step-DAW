# Brainstorm Skill

> Multi-approach exploration protocol. Use when there are multiple valid ways to solve
> a problem and you need to pick the best one — not just the first one that comes to mind.
>
> **Use this when**: The task has 2+ viable approaches and the wrong choice would be
> expensive to reverse (architecture, data model, complex UI pattern).
>
> **Don't use this when**: There's an obvious approach, or the task is small enough
> that any approach works. Don't brainstorm how to add a CSS class.

## When to Trigger

1. **Architecture decision**: New store shape, new service, new component hierarchy
2. **Algorithm choice**: Multiple valid approaches with different tradeoffs
3. **UI pattern decision**: Modal vs. panel vs. inline? Drag vs. click? Canvas vs. DOM?
4. **Integration approach**: How to connect a new feature with existing systems
5. **Performance tradeoff**: Eager vs. lazy, cache vs. recompute, sync vs. async

## Protocol (4 steps, under 5 minutes)

### Step 1: Define the Decision

Write in this format:
```
DECISION: [What specifically needs to be decided]
CONSTRAINTS: [Non-negotiable requirements]
CONTEXT: [What already exists that this must work with]
```

Example:
```
DECISION: How to implement undo/redo for track operations
CONSTRAINTS: Must handle 100+ operations, must work with Zustand, must support grouped operations
CONTEXT: Existing projectStore with track/clip actions, no current undo system
```

### Step 2: Generate 2-3 Approaches

For each approach, write exactly:
- **Name**: Short descriptive name
- **How it works**: 2-3 sentences
- **Pros**: What's good about it
- **Cons**: What's risky or costly
- **Effort**: S / M / L

Use WebSearch if you need to verify feasibility of an approach.

**Rules**:
- Minimum 2 approaches, maximum 4. Don't pad with bad options.
- At least one approach should be the "simple/boring" option.
- At least one approach should be the "ideal if we had unlimited time" option.
- Don't include approaches that violate the constraints.

### Step 3: Score and Select

Score each approach on:
| Criterion | Weight | Description |
|-----------|--------|-------------|
| Correctness | 3x | Does it actually solve the problem fully? |
| Simplicity | 2x | How easy to implement and maintain? |
| Compatibility | 2x | How well does it fit with existing code? |
| Extensibility | 1x | How easy to extend later? |

Pick the highest-scoring approach. If two are tied, pick the simpler one.

### Step 4: Document the Decision (brief)

Add a comment at the top of the primary file:
```typescript
// Architecture decision: [approach name]
// Alternatives considered: [other names]
// Rationale: [1 sentence why this one won]
```

For significant decisions (new store, new service, new data model), also record in
`.llm/decisions.md` with the full scoring table.

## Anti-Patterns

- **Analysis paralysis**: Spending 20 minutes comparing approaches for a 10-minute task.
  If the task is small, skip brainstorming and just do it.
- **Phantom options**: Including an approach you'd never actually pick just to have 3 options.
  Two genuine options is better than three with one filler.
- **Ignoring the codebase**: Proposing an approach that conflicts with existing patterns.
  Always check what patterns the codebase already uses.
- **Premature optimization**: Picking the "fastest" approach when any approach is fast enough.
  Optimize for maintainability first.
- **Committee of one**: Brainstorming without constraints leads to scope creep.
  Always define constraints first.

## Integration with Other Skills

- If an approach requires research: use `/quick-research` inline
- If the decision involves UI: check `.claude/references/design-patterns.md`
- If the decision involves store shape: check `.claude/references/store-api.md`
- After deciding, proceed with TDD implementation per `do-todo` workflow
