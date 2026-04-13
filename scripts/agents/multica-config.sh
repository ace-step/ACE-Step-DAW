#!/bin/bash
# Multica Setup — Configure Multica as optional accelerator for ACE-Step-DAW
# Run once after installing multica CLI: bash scripts/agents/multica-config.sh
set -e

REPO="ace-step/ACE-Step-DAW"
WORKSPACE="ACE-Step-DAW"

info()  { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
ok()    { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
warn()  { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }
fail()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ── Prerequisites ──
command -v multica >/dev/null 2>&1 || fail "multica not found on PATH. Install: curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash"

# Check for at least one runtime (claude or codex)
HAS_CLAUDE=0; HAS_CODEX=0
command -v claude >/dev/null 2>&1 && HAS_CLAUDE=1
command -v codex >/dev/null 2>&1 && HAS_CODEX=1
if [ "$HAS_CLAUDE" -eq 0 ] && [ "$HAS_CODEX" -eq 0 ]; then
  fail "At least one runtime (claude or codex) must be on PATH"
fi
[ "$HAS_CLAUDE" -eq 0 ] && warn "claude not found — claude-based agents will be skipped"
[ "$HAS_CODEX" -eq 0 ] && warn "codex not found — codex-based agents will be skipped"

info "Checking Multica authentication..."
if ! multica auth status --output json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('authenticated') else 1)" 2>/dev/null; then
  info "Not authenticated. Running multica login..."
  multica login
fi
ok "Authenticated"

# ── Daemon ──
info "Checking daemon status..."
if ! multica daemon status --output json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status')=='running' else 1)" 2>/dev/null; then
  info "Starting daemon..."
  multica daemon start
  sleep 3
fi
ok "Daemon running"

# ── Workspace ──
info "Configuring workspace: $WORKSPACE"
if ! multica workspace list --output json 2>/dev/null | python3 -c "import sys,json; ws=[w for w in json.load(sys.stdin) if w.get('name')=='$WORKSPACE']; exit(0 if ws else 1)" 2>/dev/null; then
  if ! multica workspace create "$WORKSPACE" --repo "$REPO" 2>/dev/null; then
    fail "Failed to create workspace '$WORKSPACE'"
  fi
fi
ok "Workspace configured"

# ── Agents ──
info "Configuring agents..."

configure_agent() {
  local name="$1" runtime="$2" desc="$3"
  # Skip if runtime not available
  if [ "$runtime" = "claude" ] && [ "$HAS_CLAUDE" -eq 0 ]; then
    warn "Skipping $name (claude not on PATH)"
    return
  fi
  if [ "$runtime" = "codex" ] && [ "$HAS_CODEX" -eq 0 ]; then
    warn "Skipping $name (codex not on PATH)"
    return
  fi
  if multica agent list --workspace "$WORKSPACE" --output json 2>/dev/null | python3 -c "import sys,json; agents=json.load(sys.stdin); exit(0 if any(a.get('name')=='$name' for a in agents) else 1)" 2>/dev/null; then
    ok "Agent exists: $name"
  else
    if multica agent create "$name" --workspace "$WORKSPACE" --runtime "$runtime" --description "$desc" 2>/dev/null; then
      ok "Created agent: $name ($runtime)"
    else
      warn "Failed to create agent: $name — continuing"
    fi
  fi
}

configure_agent "coder-claude" "claude"  "Claude Code — primary coding agent"
configure_agent "coder-codex"  "codex"   "OpenAI Codex — parallel coding agent"
configure_agent "tester"       "claude"  "Test runner — npm test + E2E"
configure_agent "reviewer"     "codex"   "Code reviewer — codex review"
configure_agent "researcher"   "claude"  "Competitive research — web search + analysis"

# ── GitHub Label ──
info "Ensuring multica-managed label exists..."
gh label create "multica-managed" --repo "$REPO" --description "Dispatched via Multica agent platform" --color "7B68EE" 2>/dev/null || true
ok "Label ready"

# ── Dashboard URL ──
DASHBOARD_URL=$(multica config get frontend-url 2>/dev/null || echo "https://app.multica.ai")

# ── Summary ──
echo ""
echo "════════════════════════════════════════"
echo "  Multica Setup Complete"
echo "════════════════════════════════════════"
echo "  Workspace:  $WORKSPACE"
echo "  Runtimes:   $([ $HAS_CLAUDE -eq 1 ] && echo 'claude')$([ $HAS_CLAUDE -eq 1 ] && [ $HAS_CODEX -eq 1 ] && echo ', ')$([ $HAS_CODEX -eq 1 ] && echo 'codex')"
echo "  Label:      multica-managed"
echo "  Dashboard:  $DASHBOARD_URL"
echo ""
echo "  Usage:"
echo "    - Label issues with 'multica-managed' for Multica dispatch"
echo "    - pm-auto.sh auto-detects Multica and dispatches accordingly"
echo "    - Issues without label use sprint-runner.sh (unchanged)"
echo "════════════════════════════════════════"
