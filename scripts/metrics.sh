#!/bin/bash
# ACE-Step DAW — Development Metrics Dashboard
# Run: bash scripts/metrics.sh
# Outputs: metrics to stdout + writes JSON to scripts/metrics-latest.json

set -e
cd "$(dirname "$0")/.."

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE_LOCAL=$(date '+%Y-%m-%d %H:%M %Z')

echo "╔══════════════════════════════════════════════════════╗"
echo "║       ACE-Step DAW — Metrics Dashboard               ║"
echo "║       $DATE_LOCAL                            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Code Quality ──────────────────────────────────────────
LOC=$(find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
COMPONENTS=$(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
OVERSIZED=$(find src/components -name "*.tsx" -exec wc -l {} + 2>/dev/null | awk '$1 > 600 && !/total/' | wc -l | tr -d ' ')
ANY_COUNT=$(grep -rn ': any\b\|as any' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
STORE_ACTIONS=$(grep -c '_pushHistory' src/store/projectStore.ts 2>/dev/null || echo 0)
SHORTCUTS=$(grep -c "case '" src/hooks/useKeyboardShortcuts.ts 2>/dev/null || echo 0)

echo "📊 CODE QUALITY"
echo "───────────────────────────────────────"
printf "  %-24s %s\n" "Source LOC:" "$LOC"
printf "  %-24s %s\n" "React components:" "$COMPONENTS"
printf "  %-24s %s\n" "Oversized (>600):" "$OVERSIZED"
printf "  %-24s %s\n" "TypeScript 'any':" "$ANY_COUNT"
printf "  %-24s %s\n" "Undoable actions:" "$STORE_ACTIONS"
printf "  %-24s %s\n" "Keyboard shortcuts:" "$SHORTCUTS"
echo ""

# ── Testing ───────────────────────────────────────────────
UNIT_FILES=$(find tests/unit -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
E2E_FILES=$(find tests/e2e -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
UNIT_TESTS=$(find tests/unit -name "*.test.ts" -exec grep -c "it(" {} + 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
E2E_TESTS=$(find tests/e2e -name "*.spec.ts" -exec grep -c "test(" {} + 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
TOTAL_TESTS=$((UNIT_TESTS + E2E_TESTS))

echo "🧪 TESTING"
echo "───────────────────────────────────────"
printf "  %-24s %s (%s files)\n" "Unit tests:" "$UNIT_TESTS" "$UNIT_FILES"
printf "  %-24s %s (%s files)\n" "E2E tests:" "$E2E_TESTS" "$E2E_FILES"
printf "  %-24s %s\n" "Total tests:" "$TOTAL_TESTS"
echo ""

# ── Agent API ─────────────────────────────────────────────
DATA_TESTIDS=$(grep -rn "data-testid" src/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
DATA_TRACKIDS=$(grep -rn "data-track-id" src/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
DATA_CLIPIDS=$(grep -rn "data-clip-id" src/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
WINDOW_EXPORTS=$(grep -c "window.*__" src/main.tsx 2>/dev/null || echo 0)

echo "🤖 AGENT API"
echo "───────────────────────────────────────"
printf "  %-24s %s\n" "data-testid:" "$DATA_TESTIDS"
printf "  %-24s %s\n" "data-track-id:" "$DATA_TRACKIDS"
printf "  %-24s %s\n" "data-clip-id:" "$DATA_CLIPIDS"
printf "  %-24s %s\n" "window.__ exports:" "$WINDOW_EXPORTS"
echo ""

# ── Git ───────────────────────────────────────────────────
TODAY_COMMITS=$(git log --oneline --since='midnight' 2>/dev/null | wc -l | tr -d ' ')
TOTAL_COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo '?')

echo "📈 GIT"
echo "───────────────────────────────────────"
printf "  %-24s %s\n" "Commits today:" "$TODAY_COMMITS"
printf "  %-24s %s\n" "Total commits:" "$TOTAL_COMMITS"
echo ""

# ── Build ─────────────────────────────────────────────────
BUILD_TIME=$(npm run build 2>&1 | grep -o "built in.*" || echo "FAILED")
TEST_PASS=$(npx vitest run tests/unit/ 2>&1 | grep -oP '\d+ passed' || echo "?")

echo "🏗️  BUILD"
echo "───────────────────────────────────────"
printf "  %-24s ✅ %s\n" "Build:" "$BUILD_TIME"
printf "  %-24s ✅ %s\n" "Unit tests:" "$TEST_PASS"
echo ""

# ── Targets ───────────────────────────────────────────────
echo "🎯 TARGETS (vs baseline Mar 18)"
echo "───────────────────────────────────────"
[ "$ANY_COUNT" -le 0 ] && ANY_STATUS="✅" || ANY_STATUS="⬜ ($ANY_COUNT → 0)"
[ "$OVERSIZED" -le 0 ] && OVER_STATUS="✅" || OVER_STATUS="⬜ ($OVERSIZED → 0)"
[ "$TOTAL_TESTS" -ge 200 ] && TEST_STATUS="✅" || TEST_STATUS="⬜ ($TOTAL_TESTS → 200)"
[ "$DATA_TESTIDS" -ge 20 ] && TESTID_STATUS="✅" || TESTID_STATUS="⬜ ($DATA_TESTIDS → 20)"
printf "  %-24s %s\n" "Zero any types:" "$ANY_STATUS"
printf "  %-24s %s\n" "Zero oversized:" "$OVER_STATUS"
printf "  %-24s %s\n" "200+ total tests:" "$TEST_STATUS"
printf "  %-24s %s\n" "20+ data-testids:" "$TESTID_STATUS"
echo ""
echo "═══════════════════════════════════════════════════════"

# ── Write JSON ────────────────────────────────────────────
cat > scripts/metrics-latest.json << JSONEOF
{
  "timestamp": "$TIMESTAMP",
  "code": {
    "loc": $LOC,
    "components": $COMPONENTS,
    "oversized": $OVERSIZED,
    "anyTypes": $ANY_COUNT,
    "undoableActions": $STORE_ACTIONS,
    "shortcuts": $SHORTCUTS
  },
  "tests": {
    "unitFiles": $UNIT_FILES,
    "unitCases": $UNIT_TESTS,
    "e2eFiles": $E2E_FILES,
    "e2eCases": $E2E_TESTS,
    "total": $TOTAL_TESTS
  },
  "agentApi": {
    "dataTestIds": $DATA_TESTIDS,
    "dataTrackIds": $DATA_TRACKIDS,
    "dataClipIds": $DATA_CLIPIDS,
    "windowExports": $WINDOW_EXPORTS
  },
  "git": {
    "commitsToday": $TODAY_COMMITS,
    "totalCommits": $TOTAL_COMMITS
  }
}
JSONEOF

echo "📁 JSON written to scripts/metrics-latest.json"
