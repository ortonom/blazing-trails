#!/usr/bin/env bash
# statusline-wiring.test.sh — installing the plugin brings the status line: the session-start hook keeps both scripts
# in the plugin's data folder, the plugin's settings point the agent panel there, and /ortonom:statusline points
# the person's statusLine there.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$(mktemp -d "${TMPDIR:-/tmp}/sl-wiring.XXXXXX")"; trap 'rm -rf "$FIX"' EXIT
pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; fi }

# Where Claude Code keeps this plugin's data, as the person's statusLine and the plugin's settings name it.
DATA='${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/data/ortonom-blazing-trails'
export CLAUDE_CONFIG_DIR="$FIX/cc"
data="$FIX/cc/plugins/data/ortonom-blazing-trails"

start=$(jq -r '.hooks.SessionStart[0].hooks[0].command // empty' "$ROOT/hooks/hooks.json")
check "a session-start hook is declared" test -n "$start"
mkdir -p "$data"
CLAUDE_PLUGIN_ROOT="$ROOT" CLAUDE_PLUGIN_DATA="$data" bash -c "$start"
check "it copies the status line into the plugin's data folder" cmp -s "$ROOT/statusline/statusline.sh" "$data/statusline.sh"
check "it copies the agent panel beside it" cmp -s "$ROOT/statusline/subagent-statusline.sh" "$data/subagent-statusline.sh"
check "both copies can run" test -x "$data/statusline.sh" -a -x "$data/subagent-statusline.sh"
echo "old" > "$data/statusline.sh"
CLAUDE_PLUGIN_ROOT="$ROOT" CLAUDE_PLUGIN_DATA="$data" bash -c "$start"
check "a later session replaces an older copy" cmp -s "$ROOT/statusline/statusline.sh" "$data/statusline.sh"

panel=$(jq -r '.subagentStatusLine.command // empty' "$ROOT/settings.json")
check "the plugin's settings point the agent panel at the data folder" test "$panel" = "$DATA/subagent-statusline.sh"
check "that command runs and draws a row" bash -c "printf '%s' '{\"session_id\":\"s\",\"columns\":80,\"tasks\":[{\"id\":\"t1\",\"name\":\"reviewer\",\"status\":\"running\"}]}' | NO_COLOR=1 bash -c '$panel' | grep -q reviewer"

cmd="$ROOT/commands/statusline.md"
check "/ortonom:statusline exists, typed only" grep -qx 'disable-model-invocation: true' "$cmd"
# Claude Code substitutes the plugin's data folder into a command file, so the setting names this machine's own path.
check "it names the statusLine command that runs the data folder's copy" grep -qF '"${CLAUDE_PLUGIN_DATA}/statusline.sh"' "$cmd"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
