# Continuous Improvement Skill

> Orchestrates periodic quality improvement cycles. Combines quality audits, harness tuning,
> competitive research, and process refinement into a unified improvement loop.
> Use this skill to keep the system getting better over time across all dimensions.

## When to Use

- After every 5 versions (v0.0.15, v0.0.20, v0.0.25...)
- When agent performance degrades noticeably
- When starting a new sprint or major feature
- When the user asks to "make things better" or "improve quality"

## The Improvement Cycle

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   1. MEASURE         2. ANALYZE         3. IMPROVE       │
│   ─────────         ─────────          ─────────         │
│   Quality Audit     Root Cause          Fix Top 3        │
│   Harness Audit     Prioritize          Update Config    │
│   Metrics Gather    Compare to Last     Create Issues    │
│                                                          │
│                     4. VERIFY                             │
│                     ─────────                             │
│                     Re-run Audit                          │
│                     Scores Improved?                      │
│                     Commit Changes                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Phase 1: MEASURE

Run all three audits and collect metrics:

### 1a. Quality Audit (use `quality-audit` skill)
- Engineering Robustness score (0-10)
- UI/UX Aesthetics score (0-10)
- Feature Completeness score (0-10)

### 1b. Harness Engineering Audit (use `harness-engineering` skill)
- CLAUDE.md size (target ≤120 lines)
- Hook coverage
- State file freshness
- Agent performance metrics

### 1c. Metrics Collection
```bash
# Test health
npm test 2>&1 | tail -5                              # Pass/fail count
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo 0 # Type errors

# Codebase health
find src -name "*.ts" -o -name "*.tsx" | wc -l        # File count
wc -l src/**/*.ts src/**/*.tsx 2>/dev/null | tail -1   # Total lines

# Agent health (if git log available)
git log --oneline --since="2 weeks ago" | wc -l        # Recent commits
git log --oneline --since="2 weeks ago" --grep="fix:" | wc -l  # Fix ratio
```

## Phase 2: ANALYZE

### Compare to Previous Audit
Read `.llm/reports/` for the last quality audit report. Compare scores:
- Which dimensions improved?
- Which regressed?
- What changed since last audit?

### Root Cause Analysis
For each dimension that scored < 7 or regressed:
1. List the specific checklist items that failed
2. Trace each failure to a root cause:
   - **Process gap**: No hook/CI check for this
   - **Knowledge gap**: Agent didn't know the standard
   - **Complexity gap**: Task was too large for one session
   - **Tooling gap**: No automated way to check this

### Prioritize
Rank improvements by: `(impact on score) × (ease of fix) / (risk of regression)`

## Phase 3: IMPROVE

### Fix Top 3 Issues
For each of the top 3 prioritized improvements:

1. **If process gap**: Add a hook, CI check, or agent rule
2. **If knowledge gap**: Add to reference doc or agent definition
3. **If complexity gap**: Break into smaller tasks, add subagent
4. **If tooling gap**: Create a script or skill

### Update Configuration
- Update `.claude/settings.json` hooks if new enforcement needed
- Update agent definitions if new guidance needed
- Update reference docs if standards changed
- Create GitHub issues for remaining items

### Record Changes
Write improvement report to `.llm/reports/improvement-cycle-YYYY-MM-DD.md`:
```markdown
# Improvement Cycle — [date]

## Previous Scores → Current Scores
| Dimension | Previous | Current | Delta |
|-----------|----------|---------|-------|
| Engineering | X | Y | +/-Z |
| UI/UX | X | Y | +/-Z |
| Completeness | X | Y | +/-Z |

## Changes Made
1. [change] — addresses [root cause]

## Issues Created
- #NNN: [title]

## Next Cycle Focus
- [what to prioritize next time]
```

## Phase 4: VERIFY

- Re-run the specific checks related to changes made
- Confirm scores improved (or at least didn't regress)
- Commit all configuration changes
- Push and create PR if appropriate

## Automation: Scheduled Improvement Cycle

To run this automatically, configure a scheduled trigger:

```json
{
  "name": "improvement-cycle",
  "schedule": "0 9 * * 5",
  "prompt": "Run the continuous-improvement skill: measure all three dimensions, analyze against last report, fix top 3 issues, and verify improvements.",
  "description": "Weekly quality improvement on Friday mornings"
}
```

## Quality Score History

Maintain a running log in `.llm/reports/quality-scores.csv`:
```csv
date,engineering,ux,completeness,overall,notes
2026-03-29,7,6,5,6,baseline audit
```

This enables trend tracking across versions.
