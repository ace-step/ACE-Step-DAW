#!/bin/bash
# Multica Setup — Configure Multica as optional accelerator for ACE-Step-DAW
# Run once after installing multica CLI: bash scripts/agents/multica-config.sh
set -e

REPO="ace-step/ACE-Step-DAW"
WORKSPACE="ACE-Step-DAW"

info()  { printf "\033[1;36m==> %s\033[0m\n" "$*"; }
ok()    { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
fail()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# ── Prerequisites ──
command -v multica >/dev/null 2>&1 || fail "multica not found on PATH. Install: curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash"
command -v claude >/dev/null 2>&1 || fail "claude (Claude Code CLI) not found on PATH"
command -v codex >/dev/null 2>&1 || fail "codex (OpenAI Codex CLI) not found on PATH"

info "Checking Multica authentication..."
if ! multica auth status 2>/dev/null | grep -q "authenticated"; then
  info "Not authenticated. Running multica login..."
  multica login
fi
ok "Authenticated"

# ── Daemon ──
info "Checking daemon status..."
if ! multica daemon status 2>/dev/null | grep -q "running"; then
  info "Starting daemon..."
  multica daemon start
  sleep 3
fi
ok "Daemon running"

# ── Workspace ──
info "Configuring workspace: $WORKSPACE"
if ! multica workspace list 2>/dev/null | grep -q "$WORKSPACE"; then
  multica workspace create "$WORKSPACE" --repo "$REPO" 2>/dev/null || true
fi
ok "Workspace configured"

# ── Agents ──
info "Configuring agents..."

configure_agent() {
  local name="$1" runtime="$2" desc="$3"
  if ! multica agent list --workspace "$WORKSPACE" 2>/dev/null | grep -q "$name"; then
    multica agent create "$name" --workspace "$WORKSPACE" --runtime "$runtime" --description "$desc" 2>/dev/null || true
    ok "Created agent: $name ($runtime)"
  else
    ok "Agent exists: $name"
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

# ── Summary ──
echo ""
echo "════════════════════════════════════════"
echo "  Multica Setup Complete"
echo "════════════════════════════════════════"
echo "  Workspace:  $WORKSPACE"
echo "  Agents:     5 (coder-claude, coder-codex, tester, reviewer, researcher)"
echo "  Label:      multica-managed"
echo "  Dashboard:  http://localhost:3000"
echo ""
echo "  Usage:"
echo "    - Label issues with 'multica-managed' for Multica dispatch"
echo "    - pm-auto.sh auto-detects Multica and dispatches accordingly"
echo "    - Issues without label use sprint-runner.sh (unchanged)"
echo "════════════════════════════════════════"
