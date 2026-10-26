#!/usr/bin/env bash
# closed.test.sh — the plugin uses only what ships inside it, plus Claude Code itself.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; "$@" 2>&1 | sed 's/^/      /'; fi }

# What a person who installs the plugin gets loaded: its components, not its tests.
shipped() { find skills commands agents output-styles hooks -type f \( -name '*.md' -o -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*'; ls statusline/*.sh skin.ts focus-read.md plan-read.md 2>/dev/null; }
own=$( { jq -r '.skills[]' .claude-plugin/plugin.json | xargs -n1 basename; ls commands agents | sed 's/\.md$//'; echo sidebar; } | sort -u)

# Each ortonom:<name> a shipped file names is one the plugin ships.
foreign_plugin_names() { shipped | xargs grep -ohE 'ortonom:[a-z-]+' | sed 's/^ortonom://' | sort -u | grep -vxF -f <(echo "$own"); }
check "every ortonom:<name> ships"         test -z "$(foreign_plugin_names)"

# An agent runs on the model the person chose; a pinned one fails for anyone without it.
pinned() { grep -l '^model:' agents/*.md; }
check "no agent pins a model"              test -z "$(pinned)"

# Claude Code's own places are allowed; any other home-directory path in prose, or any absolute one, is someone's setup.
home_paths() {
  { shipped | grep '\.md$' | xargs grep -nE '~/'; shipped | xargs grep -nE '/Users/|/home/'; } | grep -vE '~/\.claude/(CLAUDE\.md|rules|state)'
}
check "no home-directory path"             test -z "$(home_paths)"

# On a machine with skills and agents of its own, none of their names appear in a shipped file but hooks/companions.ts,
# which checks for each one at session start before any skill is told of it, and the place table's entries in
# hooks/places.ts, which know the folders other tools keep plans in by their paths. CI has none installed, so this part
# runs where they are.
installed() {
  { find -L "$HOME/.claude/skills" "$HOME/.claude/plugins/cache" -name SKILL.md 2>/dev/null | xargs -n1 dirname | xargs -n1 basename
    ls "$HOME/.claude/agents" 2>/dev/null | sed 's/\.md$//'; } | sort -u | grep -vxF -f <(echo "$own") | grep -E '^[a-z][a-z0-9-]+$'
}
named_installed() {
  local hits=""
  while read -r n; do
    [ -z "$n" ] && continue
    case $n in *-*) pat="\`$n\`|/$n\b|\b$n\b" ;; *) pat="\`$n\`|(^|[^a-z:-])/$n\b" ;; esac
    hits+=$(shipped | grep -vx 'hooks/companions.ts' | xargs grep -nE "$pat" 2>/dev/null | grep -vE "^hooks/places\.ts:[0-9]+:  \{ (label|kind): '[^']*', pattern: " | sed "s/^/$n: /")
  done <<< "$(installed)"
  printf '%s' "$hits"
}
if [ -d "$HOME/.claude/skills" ] || [ -d "$HOME/.claude/agents" ]; then
  check "no installed skill or agent outside the plugin is named" test -z "$(named_installed)"
else
  echo "skip  no installed skills or agents to check against"
fi

# The sidebar covers everything the plugin ships: skills and commands come from the engine's own list; each agent has a
# line in the skin under the skill that starts it, `<role>: <name>`, and each output style is the Output Style tab's name.
unhomed() {
  local f n
  for f in agents/*.md output-styles/*.md; do
    [ -e "$f" ] || continue
    n=$(sed -n 's/^name: //p' "$f" | head -1)
    case $f in
      agents/*) [ -n "$n" ] && grep -qE "'[a-z]+: $n[ ,']" skin.ts ;;
      *) [ -n "$n" ] && grep -qF "name: '$n'" skin.ts ;;
    esac || echo "$f: ${n:-no name}"
  done
}
check "every agent and output style has a home in the sidebar" test -z "$(unhomed)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
