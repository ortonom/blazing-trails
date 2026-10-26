#!/usr/bin/env bash
# Every suite the repo has: the plugin's validation and TypeScript tests, then each shell test; every suite runs, and any failure fails the run.
set -u
cd "$(dirname "$0")/.." || exit 2

failed=()
claude plugin validate --strict . || failed+=("claude plugin validate --strict")
claude plugin test . || failed+=("claude plugin test")
for t in tests/*.test.sh; do
  bash "$t" || failed+=("$t")
done

if [ "${#failed[@]}" -gt 0 ]; then
  printf 'failed: %s\n' "${failed[@]}" >&2
  exit 1
fi
