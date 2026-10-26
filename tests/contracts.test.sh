#!/usr/bin/env bash
# contracts.test.sh — names one side writes and another reads, which no single module owns: the state folder's file
# names, shared by the hooks, the status line scripts and the prune; and the skill names the sidebar and the companions
# list by hand, held to the skills the plugin ships; and the plugin's name on a log line, which Claude Code adds.
set -u
cd "$(dirname "$0")/.." || exit 2

pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; "$@" 2>&1 | sed 's/^/      /'; fi }
same() { diff <(printf '%s\n' "$1") <(printf '%s\n' "$2"); }

# The state files' name prefixes: those the hooks write (`${folder}/<name>-`), those the status line scripts write or
# read (`$_state/<name>-`), and those the prune deletes (`'<name>-*'` in state-folder.ts).
hooks=$(find hooks -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' -exec grep -ohE '\$\{folder\}/[a-z]+-' {} + | sed -E 's#.*/##; s/-$//' | sort -u)
shell=$(grep -ohE '\$_state/[a-z]+-' statusline/*.sh | sed -E 's#.*/##; s/-$//' | sort -u)
pruned=$(grep -oE "'[a-z]+-\*[^']*'" hooks/state-folder.ts | sed -E "s/^'([a-z]+)-.*/\1/" | sort -u)
used=$(printf '%s\n%s\n' "$hooks" "$shell" | sort -u)

check "the hooks name state files" test -n "$hooks"
check "the status line scripts name state files" test -n "$shell"
check "every state file the hooks or the status line name is pruned, and the prune names no other" same "$used" "$pruned"
check "each file the hooks write that the status line reads goes by one name" same "$(comm -12 <(echo "$hooks") <(echo "$shell"))" "$(printf '%s\n' focus worktrees)"

# The shipped skills, by folder name, and every skill name listed by hand: the sidebar's groups, the companions' users
# and the skin's extras.
shipped=$(jq -r '.skills[]' .claude-plugin/plugin.json | sed 's#.*/##' | sort -u)
listed=$( {
  grep -oE "names: \[[^]]*\]" hooks/sidebar.tsx | grep -oE "'[^']+'"
  grep -oE "skill: '[^']+'" hooks/companions.ts | grep -oE "'[^']+'"
  sed -n '/^  extras: {/,/^  }/p' skin.ts | grep -oE "^    '[^']+'"
} | tr -d " '" | sort -u)

check "the plugin ships skills" test -n "$shipped"
check "every skill named by hand is one the plugin ships" test -z "$(comm -23 <(echo "$listed") <(echo "$shipped"))"

# Claude Code puts the plugin's name in front of every line a plugin logs, so a logged text that starts with it shows
# the name twice. Each text handed to a log call, by `$.ui.log` or the plan read's `log` port, in a shipped hook.
logged() {
  find hooks -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' -exec perl -0ne 'while (/\blog\(\s*[\x27"`]([^\x27"`\n]*)/g) { print "$ARGV: $1\n" }' {} +
}

check "the hooks log text" test -n "$(logged)"
check "no logged text starts with the plugin's name, which Claude Code adds" test -z "$(logged | grep -E '^[^:]+: ortonom:')"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
