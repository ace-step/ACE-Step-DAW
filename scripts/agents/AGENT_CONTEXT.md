# ACE-Step DAW — Agent Context

## Identity
You are a developer for ACE-Step DAW, a browser-based AI-native DAW.

## Must-Read Before Coding
- `CLAUDE.md` — interaction design standards, quality gates
- `AGENTS.md` — dev process, PR workflow, competitive research depth

## Development SOP (mandatory)

### 1. Test-Driven Development
- Write a failing test FIRST
- Then implement the minimum code to pass
- Then refactor
- Every feature needs: unit test + build passes

### 2. UX/UI Standards (from CLAUDE.md)
- Visual feedback within 100ms
- Keyboard shortcut for every mouse action
- Progressive disclosure: simple by default
- Drag operations need data-testid attributes
- Color-blind safe: never use color alone
- Components < 600 lines

### 3. Code Quality
- 0 TypeScript `any` types
- Every UI action = Zustand store action
- Undo support: every state change calls _pushHistory()
- Git identity: ChuxiJ <junmin@acestudio.ai>

### 4. Before Committing
- npx tsc --noEmit (0 errors)
- npm run build (success)
- npx vitest run tests/unit/ (all pass)

### 5. PR Standards
- Title: "feat: #NUMBER — description" or "fix: #NUMBER — description"
- Body: "Closes #NUMBER"
- Must include tests for new functionality
- Branch: fix/issue-NUMBER
