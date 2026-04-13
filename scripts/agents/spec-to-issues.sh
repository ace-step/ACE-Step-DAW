#!/bin/bash
# spec-to-issues.sh — Parse OpenSpec tasks.md → GitHub Issues
# Usage: bash scripts/agents/spec-to-issues.sh <change-name>
# Creates one GitHub Issue per task, with Given/When/Then from specs/ in the body
set -e
cd "$(dirname "$0")/../.."

REPO="ace-step/ACE-Step-DAW"

info()  { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
ok()    { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn()  { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }
fail()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ── Args ──
CHANGE_NAME="${1:?Usage: spec-to-issues.sh <change-name>}"
CHANGE_DIR="openspec/changes/$CHANGE_NAME"
TASKS_FILE="$CHANGE_DIR/tasks.md"

[ -d "$CHANGE_DIR" ] || fail "Change not found: $CHANGE_DIR"
[ -f "$TASKS_FILE" ] || fail "Tasks file not found: $TASKS_FILE"

info "Decomposing spec '$CHANGE_NAME' into GitHub Issues"

# ── Read specs (if available) ──
SPEC_CONTEXT=""
if [ -d "$CHANGE_DIR/specs" ]; then
  for spec_file in "$CHANGE_DIR/specs"/*.md "$CHANGE_DIR/specs"/**/*.md; do
    [ -f "$spec_file" ] || continue
    SPEC_CONTEXT="$SPEC_CONTEXT
---
$(cat "$spec_file")
"
  done
fi

# ── Read proposal summary ──
PROPOSAL_SUMMARY=""
if [ -f "$CHANGE_DIR/proposal.md" ]; then
  # Extract first 10 non-empty lines as summary
  PROPOSAL_SUMMARY=$(grep -v '^$\|^#\|^---' "$CHANGE_DIR/proposal.md" | head -10)
fi

# ── Parse tasks ──
TASK_COUNT=0
CREATED_COUNT=0

while IFS= read -r line; do
  # Match markdown task items: - [ ] Task description
  if echo "$line" | grep -qE '^\s*-\s*\[\s*\]\s+'; then
    TASK_DESC=$(echo "$line" | sed 's/^\s*-\s*\[\s*\]\s*//')
    [ -z "$TASK_DESC" ] && continue
    TASK_COUNT=$((TASK_COUNT + 1))

    # Check for duplicate (issue with same title already exists)
    EXISTING=$(gh issue list --repo "$REPO" --state open --search "$TASK_DESC" --json number,title \
      --jq ".[] | select(.title == \"$TASK_DESC\") | .number" 2>/dev/null | head -1)
    if [ -n "$EXISTING" ]; then
      warn "Skip duplicate: #$EXISTING — $TASK_DESC"
      continue
    fi

    # Build issue body
    ISSUE_BODY="## Context

Part of OpenSpec change: \`$CHANGE_NAME\`
Task $TASK_COUNT from \`$TASKS_FILE\`
"

    if [ -n "$PROPOSAL_SUMMARY" ]; then
      ISSUE_BODY="$ISSUE_BODY
### Proposal Summary
$PROPOSAL_SUMMARY
"
    fi

    if [ -n "$SPEC_CONTEXT" ]; then
      ISSUE_BODY="$ISSUE_BODY
### Spec (Given/When/Then)

Implement according to these behavior contracts:

\`\`\`
$SPEC_CONTEXT
\`\`\`
"
    fi

    ISSUE_BODY="$ISSUE_BODY
## Acceptance Criteria

- [ ] Implementation matches spec scenarios above
- [ ] Unit tests covering all Given/When/Then cases
- [ ] \`npx tsc --noEmit\` passes
- [ ] \`npm test\` passes
- [ ] \`npm run build\` succeeds
"

    # Create issue
    ISSUE_NUM=$(gh issue create --repo "$REPO" \
      --title "$TASK_DESC" \
      --body "$ISSUE_BODY" \
      --label "enhancement" \
      --label "spec:$CHANGE_NAME" \
      2>/dev/null | grep -oE '[0-9]+$')

    if [ -n "$ISSUE_NUM" ]; then
      ok "Created #$ISSUE_NUM — $TASK_DESC"
      CREATED_COUNT=$((CREATED_COUNT + 1))
    else
      warn "Failed to create issue for: $TASK_DESC"
    fi

    # Rate limit: avoid GitHub API throttling
    sleep 1
  fi
done < "$TASKS_FILE"

# ── Create spec label if it doesn't exist ──
gh label create "spec:$CHANGE_NAME" --repo "$REPO" \
  --description "OpenSpec change: $CHANGE_NAME" \
  --color "D4C5F9" 2>/dev/null || true

# ── Summary ──
echo ""
echo "════════════════════════════════════════"
echo "  Spec Decomposition Complete"
echo "════════════════════════════════════════"
echo "  Change:   $CHANGE_NAME"
echo "  Tasks:    $TASK_COUNT found"
echo "  Created:  $CREATED_COUNT issues"
echo "  Label:    spec:$CHANGE_NAME"
echo ""
echo "  Next steps:"
echo "    - pm-auto.sh will dispatch agents automatically"
echo "    - Monitor at: http://127.0.0.1:5175 (Agent Dashboard)"
echo "    - Verify: /opsx:verify"
echo "    - Archive: /opsx:archive $CHANGE_NAME"
echo "════════════════════════════════════════"
