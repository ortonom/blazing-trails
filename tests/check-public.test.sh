#!/usr/bin/env bash
# check-public.test.sh — the guard against files planted in a scratch repo.
set -u
GUARD="$(cd "$(dirname "$0")/.." && pwd)/bin/check-public"
BASE=$(mktemp -d); trap 'rm -rf "$BASE"' EXIT
pass=0 fail=0
fresh() { rm -rf "$BASE/r"; git init -q "$BASE/r"; echo "# clean" > "$BASE/r/README.md"; }
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then ((pass++)); echo "ok    $name"; else ((fail++)); echo "FAIL  $name"; fi }
passes() { (cd "$BASE/r" && "$GUARD"); }
fails() { ! passes; }

fresh;                                                            check "a clean tree passes"                  passes
fresh; echo ask jane@"example.org" > "$BASE/r/a.md";              check "an email address fails"               fails
fresh; echo "1+me@users.noreply.github.com" > "$BASE/r/a.md";     check "a GitHub noreply address passes"      passes
fresh; echo "noreply@anthropic.com" > "$BASE/r/a.md";             check "Claude's noreply address passes"      passes
fresh; echo noreply.jane@"client.com" > "$BASE/r/a.md";           check "an address that only says noreply fails" fails
fresh; echo "## Turn 3 · user" > "$BASE/r/a.md";                  check "a transcript turn header fails"       fails
fresh; echo '{"type":"tool''_use","id":"x"}' > "$BASE/r/a.json";    check "transcript JSON fails"                fails
fresh; echo "GITHUB_TOKEN=ghp_$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 36)" > "$BASE/r/a.sh"
                                                                  check "a token fails"                        fails
fresh; echo x@"y.io" > "$BASE/r/a.md"; echo "a.md" > "$BASE/r/.gitignore"
                                                                  check "an ignored file is not read"          passes

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
