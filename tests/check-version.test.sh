#!/usr/bin/env bash
# check-version.test.sh — the version check against branches made in a scratch repo.
set -u
CHECK="$(cd "$(dirname "$0")/.." && pwd)/bin/check-version"
BASE=$(mktemp -d); trap 'rm -rf "$BASE"' EXIT
pass=0 fail=0
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; fi }
g() { git -C "$BASE/r" -c user.name=t -c user.email=t@users.noreply.github.com "$@"; }
at() { mkdir -p "$BASE/r/.claude-plugin"; printf '{"name": "p", "version": "%s"}\n' "$1" > "$BASE/r/.claude-plugin/plugin.json"; }
# A repo whose main holds version 1.0.0-alpha.1, a hook and a README, and a branch off it.
fresh() {
  rm -rf "$BASE/r"; git init -q -b main "$BASE/r"; at 1.0.0-alpha.1
  mkdir -p "$BASE/r/hooks" "$BASE/r/tests"; echo a > "$BASE/r/hooks/a.ts"; echo a > "$BASE/r/README.md"
  g add -A; g commit -qm base; g switch -qc work
}
commit() { g add -A; g commit -qm change; }
passes() { (cd "$BASE/r" && "$CHECK" main); }
unbumped() { (cd "$BASE/r" && "$CHECK" main 2>&1) | grep -q "version is still 1.0.0-alpha.1"; }

fresh;                                                         check "a branch with no change passes"                 passes
fresh; echo b > "$BASE/r/README.md"; commit;                   check "a docs change with no bump passes"              passes
fresh; echo b > "$BASE/r/tests/a.test.sh"; commit;             check "a test change with no bump passes"              passes
fresh; echo b > "$BASE/r/hooks/a.ts"; commit;                  check "a shipped change with no bump fails, naming the version" unbumped
fresh; echo b > "$BASE/r/hooks/a.ts"; at 1.0.0-alpha.2; commit; check "a shipped change with a bump passes"           passes
fresh; echo b > "$BASE/r/hooks/a.test.ts"; commit;             check "a hook's test with no bump passes"              passes
fresh;                                                         check "no common commit with the target fails"         eval '! (cd "$BASE/r" && "$CHECK" nowhere)'

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
