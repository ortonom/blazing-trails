#!/usr/bin/env bash
# commands.test.sh — clarify, regroup and sitrep keep their shape: typed only, one instruction, guardrails, a direction.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)/commands"

pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; fi }
body() { awk 'f>=2; /^---$/{f++}' "$DIR/$1.md" | sed '/^$/d'; }

for c in clarify regroup sitrep; do
  check "$c: typed only"                   grep -qx 'disable-model-invocation: true' "$DIR/$c.md"
  check "$c: one instruction, then guardrails, then a direction" \
    test "$(body "$c" | grep -vc '^- ')" = 2 -a "$(body "$c" | head -1 | cut -c1-2)" != '- '
  check "$c: the direction comes last"     test "$(body "$c" | tail -1 | cut -c1-9)" = 'End with '
done
# regroup reads across conversations, so each tool it lists must be one that only reads.
# A Bash rule matches by prefix, so `git branch` would allow `-D`, `git log` and `git diff` an --output file, and `git status` takes the index lock.
reads_only() {
  case "$1" in
    Read|Grep|Glob|'Bash(git branch --list:*)'|'Bash(git worktree list:*)'|'Bash(gh pr list:*)'|'Bash(gh pr view:*)') ;;
    *) return 1 ;;
  esac
}
tools="$(sed -n 's/^allowed-tools: //p' "$DIR/regroup.md")"
check "regroup: tools are listed"          test -n "$tools"
IFS=, read -ra listed <<< "$tools"
for t in "${listed[@]}"; do
  t="${t# }"
  check "regroup: $t only reads"           reads_only "$t"
done

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
