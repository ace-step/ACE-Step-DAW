#!/bin/bash
# Agent Registry — single source of truth for who's doing what
# File: /tmp/agent-registry.json
# Format: {"agents": [{"id": "codex-434", "issue": 434, "tool": "codex", "pid": 12345, "started": "10:30:00", "status": "running"}]}

REGISTRY="/tmp/agent-registry.json"
[ ! -f "$REGISTRY" ] && echo '{"agents":[]}' > "$REGISTRY"

register() {
  local ISSUE=$1 TOOL=$2 PID=$3
  local ID="${TOOL}-${ISSUE}"
  local TIME=$(date '+%H:%M:%S')
  python3 -c "
import json
r = json.load(open('$REGISTRY'))
# Remove any existing entry for this issue
r['agents'] = [a for a in r['agents'] if a['issue'] != $ISSUE]
r['agents'].append({'id': '$ID', 'issue': $ISSUE, 'tool': '$TOOL', 'pid': $PID, 'started': '$TIME', 'status': 'running'})
json.dump(r, open('$REGISTRY', 'w'), indent=2)
"
  echo "Registered: $ID (PID $PID)"
}

unregister() {
  local ISSUE=$1
  python3 -c "
import json
r = json.load(open('$REGISTRY'))
r['agents'] = [a for a in r['agents'] if a['issue'] != $ISSUE]
json.dump(r, open('$REGISTRY', 'w'), indent=2)
"
  echo "Unregistered: #$ISSUE"
}

is_assigned() {
  local ISSUE=$1
  python3 -c "
import json
r = json.load(open('$REGISTRY'))
assigned = [a for a in r['agents'] if a['issue'] == $ISSUE and a['status'] == 'running']
# Verify PID is still alive
for a in assigned:
    import os
    try: os.kill(a['pid'], 0); print('yes'); exit()
    except: pass
# Dead agent — clean up
r['agents'] = [a for a in r['agents'] if a['issue'] != $ISSUE]
json.dump(r, open('$REGISTRY', 'w'), indent=2)
print('no')
"
}

list_agents() {
  python3 -c "
import json, os
r = json.load(open('$REGISTRY'))
alive = []
for a in r['agents']:
    try:
        os.kill(a['pid'], 0)
        alive.append(a)
        print(f\"  {a['id']:15s}  #{a['issue']}  PID:{a['pid']}  ⏱{a['started']}  {a['status']}\")
    except:
        pass  # dead process
# Update registry with only alive agents
r['agents'] = alive
json.dump(r, open('$REGISTRY', 'w'), indent=2)
if not alive: print('  (no agents)')
"
}

# CLI
case "$1" in
  register)   register "$2" "$3" "$4" ;;
  unregister) unregister "$2" ;;
  check)      is_assigned "$2" ;;
  list)       list_agents ;;
  *)          echo "Usage: registry.sh register|unregister|check|list [args]" ;;
esac
