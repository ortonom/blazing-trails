#!/usr/bin/env bash
# structured.test.sh — the structured style writes no emoji, and its ✓ ✗ ▲ marks are not emoji.
set -u
FILE="$(cd "$(dirname "$0")/.." && pwd)/output-styles/structured.md"

pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; fi }

pictographic() { node -e 'process.exit(/\p{Extended_Pictographic}/u.test(process.argv[1]) ? 0 : 1)' "$1"; }
no_emoji() { ! pictographic "$(cat "$FILE")"; }

check "structured.md has no emoji"            no_emoji
check "the mark ✓ is not read as emoji"       test "$(pictographic '✓' && echo yes || echo no)" = no
check "the mark ✗ is not read as emoji"       test "$(pictographic '✗' && echo yes || echo no)" = no
check "the mark ▲ is not read as emoji"       test "$(pictographic '▲' && echo yes || echo no)" = no
check "the emoji check catches an emoji"      pictographic '🙂'

echo "$pass passed, $fail failed"
test "$fail" = 0
