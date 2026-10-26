#!/usr/bin/env bash
# state-version.test.sh — the focus state's shape has one version wherever a key carries it: the focus atom, which the
# engine reads only as a literal in each file that declares it, the store keys and the plugin state's type.
set -u
cd "$(dirname "$0")/.." || exit 2

pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; "$@" 2>&1 | sed 's/^/      /'; fi }

versions() { find hooks types -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' -exec grep -ohE 'focus(For)?V[0-9]+' {} + | grep -oE 'V[0-9]+$' | sort -u; }
check "every versioned focus key names one version" test "$(versions | wc -l | tr -d ' ')" = 1
check "the held session id's key carries it too" grep -qE "focusFor$(versions | head -1)\\b" hooks/focus-state.ts
for f in hooks/focus-state.ts hooks/sidebar.tsx hooks/state.ts types/index.d.ts; do
  check "$f carries the version" grep -qE "focus$(versions | head -1)\\b" "$f"
done

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
