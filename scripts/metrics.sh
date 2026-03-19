#!/bin/bash
# ACE-Step DAW — Development Metrics Dashboard
# Run: bash scripts/metrics.sh

set -e
cd "$(dirname "$0")/.."

echo "╔══════════════════════════════════════════════════════╗"
echo "║         ACE-Step DAW — Metrics Dashboard             ║"
echo "║         $(date '+%Y-%m-%d %H:%M %Z')                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Code Quality ──────────────────────────────────────────
echo "📊 CODE QUALITY"
echo "───────────────────────────────────────"

LOC=$(find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
echo "  Source LOC:        $LOC"

COMPONENTS=$(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "  React components:  $COMPONENTS"

OVERSIZED=$(find src/components -name "*.tsx" -exec wc -l {} + 2>/dev/null | awk '$1 > 600 && !/total/' | wc -l | tr -d ' ')
echo "  Oversized (>600):  $OVERSIZED"

STORE_ACTIONS=$(grep -E "^\s+\w+:\s*\(" src/store/projectStore.ts 2>/dev/null | wc -l | tr -d ' ')
echo "  Store actions:     $STORE_ACTIONS"

SHORTCUTS=$(grep -c "case '" src/hooks/useKeyboardShortcuts.ts 2>/dev/null || echo 0)
echo "  Keyboard shortcuts: $SHORTCUTS"

echo ""

# ── Test Coverage ─────────────────────────────────────────
echo "🧪 TESTING"
echo "───────────────────────────────────────"

UNIT_FILES=$(find tests/unit -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
E2E_FILES=$(find tests/e2e -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
UNIT_TESTS=$(find tests/unit -name "*.test.ts" -exec grep -c "it(" {} + 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
E2E_TESTS=$(find tests/e2e -name "*.spec.ts" -exec grep -c "test(" {} + 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')

echo "  Unit test files:   $UNIT_FILES"
echo "  Unit test cases:   $UNIT_TESTS"
echo "  E2E test files:    $E2E_FILES"
echo "  E2E test cases:    $E2E_TESTS"
echo "  Total tests:       $((UNIT_TESTS + E2E_TESTS))"

echo ""

# ── Agent-Friendliness ────────────────────────────────────
echo "🤖 AGENT API"
echo "───────────────────────────────────────"

DATA_TESTIDS=$(grep -r "data-testid" src/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "  data-testid attrs: $DATA_TESTIDS"

WINDOW_STORE=$(grep -c "window.__" src/main.tsx 2>/dev/null || echo 0)
echo "  window.__ exports: $WINDOW_STORE"

echo ""

# ── Git Stats ─────────────────────────────────────────────
echo "📈 GIT (today)"
echo "───────────────────────────────────────"

TODAY_COMMITS=$(git log --oneline --since='midnight' 2>/dev/null | wc -l | tr -d ' ')
echo "  Commits today:     $TODAY_COMMITS"

TOTAL_COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo '?')
echo "  Total commits:     $TOTAL_COMMITS"

echo ""

# ── Build Health ──────────────────────────────────────────
echo "🏗️  BUILD"
echo "───────────────────────────────────────"

BUILD_RESULT=$(npm run build 2>&1 | grep -o "built in.*" || echo "FAILED")
echo "  Status:            ✅ $BUILD_RESULT"

TEST_RESULT=$(npx vitest run tests/unit/ 2>&1 | grep "Tests" | head -1)
echo "  Unit tests:        $TEST_RESULT"

echo ""
echo "═══════════════════════════════════════════════════════"
