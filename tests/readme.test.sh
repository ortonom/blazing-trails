#!/usr/bin/env bash
# README.md states the health score's numbers and the levels as hooks/level.ts and hooks/scorecard.ts hold them.
set -u
cd "$(dirname "$0")/.." || exit 2
exec node --experimental-strip-types --no-warnings tests/readme.mjs
