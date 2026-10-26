#!/bin/bash
# statusline.test.sh — the statusline renderer battery. Feeds the REAL statusline
# the real hook stdin shape and asserts what its rows say: the identity, the rate-limit
# windows and their bars, the session's worktrees and the cached PR number with its checks.
# The sub-agent rows of subagent-statusline.sh are asserted at the end.
#
# Run:  tests/statusline.test.sh
set -uo pipefail

SL="$(cd "$(dirname "$0")/.." && pwd)/statusline/statusline.sh"
FIX="$(mktemp -d "${TMPDIR:-/tmp}/statusline.XXXXXX")"
SL_NOW=$(date +%s)  # the clock every render reads, so a slow render sees the reset times the test set
trap 'rm -rf "$FIX"' EXIT
export CLAUDE_CONFIG_DIR="$FIX/cc"
PASS=0; FAIL=0

PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"context_window":{"used_percentage":5}}'

# CONTRACT: STATUSLINE_STATE is pinned at the fixture on EVERY render unless a test names its own, not just in the
# PR battery — unpinned, any test whose cwd happens to be a git repo would write its cache
# into the operator's real state folder and fork a live `gh`. STATUSLINE_PR_GH points
# the lookup at a stub for the same reason: no test may talk to GitHub.
render() { printf '%s' "$PAYLOAD" | \
  STATUSLINE_NOW="$SL_NOW" NO_COLOR="${PLAIN-1}" STATUSLINE_STATE="${STATUSLINE_STATE-$FIX/sl}" STATUSLINE_PR_GH="$FIX/gh" bash "$SL" 2>"$FIX/stderr"; }

says() { # <desc> <expected substring>
  local out; out="$(render)"
  if grep -qF "$2" <<< "$out"; then PASS=$((PASS+1)); printf '  ok   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s\n       wanted <<%s>>\n       got    <<%s>>\n' "$1" "$2" "$out"; fi
}
missing() { # <desc> <substring that must NOT appear>
  local out; out="$(render)"
  if grep -qF "$2" <<< "$out"; then FAIL=$((FAIL+1)); printf '  FAIL %s\n       did not want <<%s>>\n       got          <<%s>>\n' "$1" "$2" "$out"
  else PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; fi
}
follows() { # <desc> <substring of a row> <what the next row starts with>
  local out; out="$(render)"
  if printf '%s\n' "$out" | awk -v a="$2" -v b="$3" 'found { exit !(index($0, b) == 1) } index($0, a) { found = 1 } END { if (!found) exit 1 }'; then PASS=$((PASS+1)); printf '  ok   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s\n       wanted <<%s>> then a row starting <<%s>>\n       got    <<%s>>\n' "$1" "$2" "$3" "$out"; fi
}
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
no() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

echo "== the line renders at all =="
says "the model segment renders" "M"
PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"effort":{"level":"high"},"context_window":{"used_percentage":5}}'
if [ "$(render)" = "┌─ location ─┬─ worktree ─┬─ model ─────┐
│ /tmp       │            │ M           │
│            │            │ high effort │
├─ usage ────┴────────────┴─────────────┤
│ ctx 5%                                │
└───────────────────────────────────────┘" ]; then ok "the path leads the location panel; model and effort fill the others, and ctx the usage row"
else no "the path leads the location panel; model and effort fill the others, and ctx the usage row ($(render | tr '\n' '~'))"; fi
PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"context_window":{"used_percentage":5}}'
if [ "$(render >/dev/null; echo $?)" = 0 ]; then ok "statusline exits 0"; else no "statusline exits 0"; fi
mkdir -p "$FIX/sl"

PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"context_window":{"used_percentage":5}}'

echo "== nothing is written to stderr on the plain path =="
render >/dev/null
if [ -s "$FIX/stderr" ]; then no "a plain render is silent on stderr ($(head -1 "$FIX/stderr"))"
else ok "a plain render is silent on stderr"; fi

echo "== the rate-limit windows =="
# resets_at is typed BOTH as an ISO string and as epoch seconds across the 2.1.222
# bundle's schemas, so both shapes are fed here — dropping either one silently
# removes the reset clock on whichever build ships the other.
limits() { # <five_hour json> <seven_day json>
  PAYLOAD="{\"workspace\":{\"current_dir\":\"/tmp\"},\"model\":{\"display_name\":\"M\"},\"rate_limits\":{\"five_hour\":$1,\"seven_day\":$2}}"
}
# A UTC time <spec> and 30 minutes from now (spec as 3H, 45M or 2d), with GNU's date or BSD's.
_secs() { local n=${1%[HMd]}; case $1 in *H) echo $((n * 3600)) ;; *M) echo $((n * 60)) ;; *d) echo $((n * 86400)) ;; esac; }
_utc() { if date --version >/dev/null 2>&1; then date -u -d "@$1" +"$2"; else date -u -r "$1" +"$2"; fi; }
_later() { _utc $(( $(date +%s) + $(_secs "$1") + 1800 )) "$2"; }
iso_in()   { _later "$1" %Y-%m-%dT%H:%M:%SZ; }
epoch_in() { echo $(( SL_NOW + $1 )); }

limits "{\"used_percentage\":41.5,\"resets_at\":\"$(iso_in 3H)\"}" null
# The +30M offset in iso_in keeps the hour stable: a second-boundary race moves the
# minutes (29 vs 30) but never the "3h", so the assertion is not flaky.
says "five_hour renders remaining % from an ISO resets_at, in UTC" "session 58% left (3h"

limits null "{\"used_percentage\":12,\"resets_at\":$(epoch_in 190000)}"
says "seven_day renders days from an epoch resets_at" "week 88% left (2d"

# CONTRACT: both windows are nullish. A window that is absent must vanish, not
# render "100% left" — that reads as headroom the operator does not necessarily have.
limits null null
if grep -qE 'session|week ' <<< "$(render)"; then no "absent windows render nothing"; else ok "absent windows render nothing"; fi

# A null resets_at keeps the percentage and drops only the clock.
limits '{"used_percentage":3,"resets_at":null}' null
says "a null resets_at still renders the percentage" "session 97% left"
if grep -qF 'session 97% left (' <<< "$(render)"; then no "a null resets_at renders no empty parens"; else ok "a null resets_at renders no empty parens"; fi

# A window already past its reset must not print a negative or a bare unit.
limits "{\"used_percentage\":50,\"resets_at\":$(epoch_in -600)}" null
if grep -qE '\(-|\(\)' <<< "$(render)"; then no "an expired window prints no negative clock"; else ok "an expired window prints no negative clock"; fi

echo "== an unreadable window says so, and never says 100% =="
# The reassuring direction is the dangerous one: `bc` resolved an unknown identifier
# to 0 and exited 0, so a non-numeric percentage rendered "sess 100% left" — full
# headroom, which is the number an operator starts a long run on.
for bad in true '"lots"' '{"a":1}' 140 -10; do
  limits "{\"used_percentage\":$bad,\"resets_at\":null}" null
  says "used_percentage $bad renders ? not a number" "session ?% left"
done

# Every ISO spelling the API might send. A wrong clock is worse than a missing one,
# so the two offset forms assert the VALUE, not merely that something rendered.
iso_off() { _later "$1" "%Y-%m-%dT%H:%M:%S$2"; }
limits "{\"used_percentage\":10,\"resets_at\":\"$(iso_off 3H +00:00)\"}" null
says "an RFC 3339 +00:00 offset parses (BSD %z rejects the colon)" "session 90% left (3h"
limits "{\"used_percentage\":10,\"resets_at\":\"$(_later 3H %Y-%m-%dT%H:%M:%S).500Z\"}" null
says "fractional seconds are stripped without taking the zone" "session 90% left (3h"

# A millisecond epoch is a shape the bundle itself creates (`resets_at*1000`).
limits "{\"used_percentage\":10,\"resets_at\":$(( (SL_NOW + 10800) * 1000 ))}" null
says "a millisecond epoch degrades to ? rather than 20650626d5h" "session 90% left (?)"

limits '{"used_percentage":10,"resets_at":"not-a-date"}' null
says "an unparseable resets_at degrades to ?" "session 90% left (?)"

# Sub-minute must not read as "resets now" while the window is still live.
limits "{\"used_percentage\":10,\"resets_at\":$(epoch_in 30)}" null
says "a sub-minute delta renders <1m, never 0m" "session 90% left (<1m)"

echo "== the 5-hour window's pace =="
# 70% used three hours in, two hours left: the rest goes in about 1h17m, before the reset.
limits "{\"used_percentage\":70,\"resets_at\":$(epoch_in 7200)}" null
says "a window that runs out before its reset warns when" "session 30% left (2h00m) out in 1h1"
limits "{\"used_percentage\":10,\"resets_at\":$(epoch_in 7200)}" null
missing "a window on pace to last says nothing more" "out in"
limits "{\"used_percentage\":50,\"resets_at\":$(epoch_in 17900)}" null
missing "the first ten minutes of a window say nothing about pace" "out in"
limits null "{\"used_percentage\":90,\"resets_at\":$(epoch_in 7200)}"
missing "the weekly window carries no pace" "out in"

echo "== the rate-limit paths write nothing to stderr =="
# The stderr battery above predates these paths, and _reset_in is the one new site
# that shells out to a parser which fails routinely. Two shapes reached stderr in
# review: a jq object hitting printf, and a zero-padded epoch read as octal.
for bad in 'true' '{"a":1}' '"08"' '"not-a-date"' '"2026-08-04T12:00:00+02:00"' '0'; do
  limits "{\"used_percentage\":10,\"resets_at\":$bad}" null
  render >/dev/null
  if [ -s "$FIX/stderr" ]; then no "resets_at $bad is silent on stderr (got: $(cat "$FIX/stderr"))"
  else ok "resets_at $bad is silent on stderr"; fi
done

echo "== the bracket is the identity; the path is only its fallback =="
# The bracket carries repo, branch and PR, and the path shows only when there is no bracket:
# outside any git repo the path is the only identity the line has.
# A real git repo, because the branch is read from git, not from the payload.
mkrepo() { # <dir> <branch>
  mkdir -p "$FIX/$1"
  git -C "$FIX/$1" init -q 2>/dev/null
  # The committer is the fixture's own, so the commit lands on a machine with no git identity, as CI is.
  GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git -C "$FIX/$1" commit -q --allow-empty -m x --author='t <t@t>' 2>/dev/null
  git -C "$FIX/$1" checkout -q -b "$2" 2>/dev/null
}
at() { # <dir> — render with current_dir pointed into the fixture repo
  PAYLOAD="{\"workspace\":{\"current_dir\":\"$FIX/$1\",\"repo\":{\"name\":\"web-sites\"}},\"model\":{\"display_name\":\"M\"}}"
}
mkrepo worktrees/rounds+foo worktree-rounds+foo
at worktrees/rounds+foo
says "inside a repo the location is the repo and the worktree column the branch" "│ web-sites  │ worktree-rounds+foo │"
missing "inside a repo no path segment renders" "worktrees"

mkrepo deep/nested/spot some-other-branch
at deep/nested/spot
missing "a sub-directory location is dropped, not shown" "nested/spot"

# WATCH: inside a worktree, --show-toplevel names the WORKTREE, not the repo — the bracket
# rendered `[statusline-pr-number:statusline-pr-number]`, the branch twice and the repo
# never. Only reachable when the payload omits workspace.repo.name, which is exactly when
# the fallback is all there is. A real worktree, because that is the thing under test.
mkrepo mainrepo trunk
git -C "$FIX/mainrepo" worktree add -q "$FIX/mainrepo/.claude/worktrees/feature" -b feature 2>/dev/null
PAYLOAD="{\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/feature\"},\"model\":{\"display_name\":\"M\"}}"
says "in a worktree the repo is the location and the worktree column the tree, with a branch that differs" "│ mainrepo   │ feature ▸ feature │"
missing "in a worktree the repo is not joined to the branch" "mainrepo:"

# Asserted from both sides: the primary checkout carries no worktree name.
PAYLOAD="{\"workspace\":{\"current_dir\":\"$FIX/mainrepo\",\"repo\":{\"name\":\"mainrepo\"}},\"model\":{\"display_name\":\"M\"}}"
says "the primary checkout's worktree column is its branch" "│ mainrepo   │ trunk      │"

# A session that works in its worktrees by path stays in the primary checkout.
mkdir -p "$FIX/sl"; git -C "$FIX/mainrepo" worktree add -q "$FIX/mainrepo/.claude/worktrees/second" -b second 2>/dev/null
mkrepo other trunk
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/feature" "$FIX/mainrepo/.claude/worktrees/gone" "$FIX/other" \
  "$FIX/mainrepo/.claude/worktrees/second" > "$FIX/sl/worktrees-s1"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
rows_are() { # <desc> <expected rows, joined by newlines>
  local out; out="$(render)"
  if [ "$out" = "$2" ]; then ok "$1"; else no "$1"; printf '       wanted <<%s>>\n       got    <<%s>>\n' "$2" "$out"; fi
}
rows_are "from the primary checkout each worktree the session opened is a row, its repo in the location column and its folder in the worktree column" "┌─ location ─┬─ worktree ─────────────┬─ model ─┐
│ mainrepo   │ trunk                  │ M       │
│            │                        │         │
│ + mainrepo │ feature ▸ feature idle │         │
│ + mainrepo │ second ▸ second idle   │         │
└────────────┴────────────────────────┴─────────┘"
PAYLOAD="{\"session_id\":\"s2\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
missing "another session's worktrees stay off the line" "idle"
printf '482\n' > "$FIX/sl/pr-mainrepo__second"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
says "a worktree the session opened carries its own branch's PR" "│ + mainrepo │ second ▸ second #482 idle │"

# A session marks worktrees of any repo; one of another repo is named by its repo.
git -C "$FIX/other" worktree add -q "$FIX/other/.claude/worktrees/ext" -b ext 2>/dev/null
git -C "$FIX/other" worktree add -q "$FIX/other/.claude/worktrees/ext2" -b ext2 2>/dev/null
printf '%s\n' "$FIX/other/.claude/worktrees/ext" "$FIX/other/.claude/worktrees/ext2" >> "$FIX/sl/worktrees-s1"
printf '77\n' > "$FIX/sl/pr-other__ext"
rows_are "three other worktrees show two lines and a count" "┌─ location ─┬─ worktree ────────────────┬─ model ─┐
│ mainrepo   │ trunk                     │ M       │
│            │                           │         │
│ + mainrepo │ feature ▸ feature idle    │         │
│ + mainrepo │ second ▸ second #482 idle │         │
│            │ +2 more                   │         │
└────────────┴───────────────────────────┴─────────┘"

printf '12\n' > "$FIX/sl/pr-mainrepo__feature"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/feature\"},\"model\":{\"display_name\":\"M\"}}"
rows_are "inside a worktree it leads and is not repeated below; a worktree of another repo is named by its repo, with its own PR" "┌─ location ─┬─ worktree ────────────────┬─ model ─┐
│ mainrepo   │ feature ▸ feature #12     │ M       │
│            │                           │         │
│ + mainrepo │ second ▸ second #482 idle │         │
│ + other    │ ext ▸ ext #77 idle        │         │
│            │ +1 more                   │         │
└────────────┴───────────────────────────┴─────────┘"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/other/.claude/worktrees/ext2\"},\"model\":{\"display_name\":\"M\"}}"
rows_are "inside another repo's worktree that repo leads and this one's are named" "┌─ location ─┬─ worktree ─────────────────┬─ model ─┐
│ other      │ ext2 ▸ ext2                │ M       │
│            │                            │         │
│ + mainrepo │ feature ▸ feature #12 idle │         │
│ + mainrepo │ second ▸ second #482 idle  │         │
│            │ +1 more                    │         │
└────────────┴────────────────────────────┴─────────┘"

PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX\"},\"model\":{\"display_name\":\"M\"},\"context_window\":{\"used_percentage\":\"x\"}}"
render > /dev/null
if [ ! -s "$FIX/stderr" ]; then ok "a non-numeric context is silent on stderr"; else no "a non-numeric context is silent on stderr"; fi

mkdir -p "$FIX/parent/dir"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/parent/dir\"},\"model\":{\"display_name\":\"M\"}}"
says "outside any repo the path leads the location column" "│ parent/dir │                            │ M "
says "outside any repo the session's worktrees still follow" "│ + mainrepo │ feature ▸ feature #12 idle │"

# The branch is the worktree's own, not its folder's name; a detached HEAD has none to name.
git -C "$FIX/mainrepo" worktree add -q "$FIX/mainrepo/.claude/worktrees/fix-482" -b restore/endorsed-copy-edits 2>/dev/null
git -C "$FIX/mainrepo" worktree add -q --detach "$FIX/mainrepo/.claude/worktrees/pinned" 2>/dev/null
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/fix-482" "$FIX/mainrepo/.claude/worktrees/pinned" > "$FIX/sl/worktrees-s3"
PAYLOAD="{\"session_id\":\"s3\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
rows_are "a worktree line names the branch it is on, not its folder; a detached one ends at the tree" "┌─ location ─┬─ worktree ───────────────────────────────┬─ model ─┐
│ mainrepo   │ trunk                                    │ M       │
│            │                                          │         │
│ + mainrepo │ fix-482 ▸ restore/endorsed-copy-ed… idle │         │
│ + mainrepo │ pinned idle                              │         │
└────────────┴──────────────────────────────────────────┴─────────┘"
PAYLOAD="{\"session_id\":\"s3\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/fix-482\"},\"model\":{\"display_name\":\"M\"}}"
says "inside a worktree the worktree column names the branch it is on, not only its folder" "│ mainrepo   │ fix-482 ▸ restore/endorsed-copy-edits │"
PAYLOAD="{\"session_id\":\"s3\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/pinned\"},\"model\":{\"display_name\":\"M\"}}"
says "inside a detached worktree the worktree column ends at the folder" "│ mainrepo   │ pinned "

echo "== the agents working in each checkout, as subagent-statusline.sh wrote them =="
mkdir -p "$FIX/mainrepo/.claude/worktrees/second/sub"
printf '%s\t36\treviewer\tclaude-opus-5-5\tworking\n%s\t35\tscout\tclaude-haiku-5-5\tstalled\n%s\t34\tfixer\tclaude-sonnet-5-5\tworking\n' \
  "$FIX/mainrepo/.claude/worktrees/second" "$FIX/mainrepo/.claude/worktrees/second/sub" "$FIX/mainrepo" > "$FIX/sl/agents-s1"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
says "a worktree's row names the agents working in it" "│ + mainrepo │ second #482 reviewer working, scout sta… │"
rows_are "an agent in the checkout you stand in stays off the worktree rows" "┌─ location ─┬─ worktree ───────────────────────────────┬─ model ─┐
│ mainrepo   │ trunk                                    │ M       │
│            │                                          │         │
│ + mainrepo │ feature ▸ feature #12 idle               │         │
│ + mainrepo │ second #482 reviewer working, scout sta… │         │
│            │ +2 more                                  │         │
└────────────┴──────────────────────────────────────────┴─────────┘"
says "a worktree no agent works in is marked idle" "│ + mainrepo │ feature ▸ feature #12 idle "
touch -t 200001010000 "$FIX/sl/agents-s1"
says "an agents file the panel stopped writing is read as none" "│ + mainrepo │ second ▸ second #482 idle "
rm -f "$FIX/sl/agents-s1"
render >/dev/null
if [ -s "$FIX/stderr" ]; then no "the session's worktrees render silent on stderr ($(head -1 "$FIX/stderr"))"
else ok "the session's worktrees render silent on stderr"; fi
rm -f "$FIX/sl/pr-mainrepo__feature"

# The fallback. cwd is a plain directory holding sibling repos and is not itself one, so
# both git calls come back empty and the bracket cannot render at all.
mkdir -p "$FIX/work/ops"
PAYLOAD="{\"workspace\":{\"current_dir\":\"$FIX/work/ops\"},\"model\":{\"display_name\":\"M\"}}"
says "outside any repo the path is the identity" "work/ops
M"

echo "== the PR number: read from cache, never fetched inline =="
# WATCH: `gh pr list` measured 1.2s and this line re-renders every 5s, so the ONLY thing
# under test on the render path is the cache read. A stub stands in for gh; if the real
# binary is ever reached the fixture cache below would not be what renders.
cat > "$FIX/gh" <<'STUB'
#!/bin/bash
echo ran >> "$STATUSLINE_STATE/GH-RAN"
echo 777
STUB
chmod +x "$FIX/gh"
mkdir -p "$FIX/sl"
mkrepo prrepo feature/thing
at prrepo
# The key flattens the slash in feature/thing, so the file is `pr-web-sites__feature-thing`.
prcache() { printf '%s\n' "$1" > "$FIX/sl/pr-web-sites__feature-thing"; }

prcache 482
says "a cached number follows the branch in the worktree column" "│ web-sites  │ feature/thing #482 │"

prcache '482 pass'
says "passing checks say so" "#482 checks pass"
prcache '482 pending'
says "running checks say so" "#482 checks running"
prcache '482 fail'
says "failing checks say so" "#482 checks failing"
prcache '482 none'
if [ "$(render | sed -n 2p)" = "│ web-sites  │ feature/thing #482 │ M       │" ]; then ok "a PR with no checks has no mark"; else no "a PR with no checks has no mark ($(render | sed -n 2p))"; fi
prcache 482

prcache -
missing "a settled no-PR answer renders nothing" "#"

prcache 'not-a-number'
missing "an unparseable cache value renders nothing, not itself" "not-a-number"

: > "$FIX/sl/pr-web-sites__feature-thing"
missing "an empty cache renders nothing" "#"

# The refresh is stamped by touching the cache BEFORE forking, so a fresh file must not
# re-fork. Without that ordering the fetch would respawn on every 5s render forever.
rm -f "$FIX/sl/GH-RAN"
prcache 482
render >/dev/null
sleep 1
if [ -f "$FIX/sl/GH-RAN" ]; then no "a fresh cache does not re-fetch"
else ok "a fresh cache does not re-fetch"; fi

# ...and a stale one does, without ever withholding the value it already has: the render
# that triggers the refresh still prints the old number rather than blanking to wait.
rm -f "$FIX/sl/GH-RAN"
touch -t 200001010000 "$FIX/sl/pr-web-sites__feature-thing"
says "a stale cache still renders its old value" "#482"
# WATCH (confirmed 2026-08-06): this waited a flat `sleep 1` for the forked child to
# land its file and went red on the self-hosted runner, where the whole battery runs
# under parallel load — a green suite locally, a red PR gate. A positive assertion
# about a fork must POLL to its deadline; only the negative one above (nothing may
# appear) is honest with a fixed wait, since more waiting only makes it stricter.
for _ in $(seq 1 100); do [ -f "$FIX/sl/GH-RAN" ] && break; sleep 0.1; done
if [ -f "$FIX/sl/GH-RAN" ]; then ok "a stale cache fires a background refresh"
else no "a stale cache fires a background refresh"; fi

echo "== the plan files the session touched, by place =="
FR=$(cd "$FIX" && pwd -P)
WT="$FR/mainrepo/.claude/worktrees/feature"
export CLAUDE_CONFIG_DIR="$FIX/cc"
export STATUSLINE_STATE="$FIX/sl"; mkdir -p "$STATUSLINE_STATE"
mkdir -p "$WT/.sdlc" "$CLAUDE_CONFIG_DIR/plans"
: > "$WT/.sdlc/spec.md"; : > "$WT/.sdlc/tasks.md"; : > "$CLAUDE_CONFIG_DIR/plans/calm-river.md"
# The places Blazing Trails lists in its focus file: each plan file's path, the label of the place it sits in, and w, r
# or b for written, read or only named in a command. Which files count and where each sits is decided there.
place() { # <session> <mark> <path> <label>
  jq -c --arg m "$2" --arg p "$3" --arg l "$4" '.places += [{path: $p, label: $l, mark: $m}]' "$STATUSLINE_STATE/focus-$1.json" > "$FIX/p.json" && mv "$FIX/p.json" "$STATUSLINE_STATE/focus-$1.json"
}
printf '{"v":1,"health":9,"level":"goals","plan":"","rows":[],"places":[]}' > "$STATUSLINE_STATE/focus-plans.json"
PAYLOAD="{\"session_id\":\"plans\",\"workspace\":{\"current_dir\":\"$WT\"},\"model\":{\"display_name\":\"M\"}}"
missing "a session that touched no plan file has no plans row" "☰"
place plans w "$WT/.sdlc/spec.md" "worktree .sdlc/"
says "a plan file written in the worktree is one place" "☰ worktree .sdlc/ 1   ✓ one place"
follows "the box top sits under the plans row" "one place" "┌─ location"
place plans b "$WT/.sdlc/tasks.md" "worktree .sdlc/"
says "files in one place are counted together" "worktree .sdlc/ 2"
place plans b "$WT/.sdlc" "worktree .sdlc/"
says "a folder a command named is no file" "worktree .sdlc/ 2"
place plans r "$CLAUDE_CONFIG_DIR/plans/calm-river.md" "plan"
says "a second place is counted, and two places are split" "plan 1   ▲ split across 2 places"
place plans r "$FR/mainrepo/.scratch/broker-kit/map.md" "main .scratch/"
says "a plan file that is gone names its place and says so" "main .scratch/ 1 gone"
place plans b "$FR/mainrepo/docs/plans" "main docs/plans/"
missing "a command naming a path that is not there is a search pattern, not a plan" "docs/plans"
mkdir -p "$WT/.oneshot"; : > "$WT/.oneshot/intent.md"
place plans w "$WT/.oneshot/intent.md" "worktree .oneshot/"
says "each place is drawn by the label it is given" "worktree .oneshot/ 1"
: > "$FR/mainrepo/.claude/RESUME.md"; touch -t 202601010000 "$FR/mainrepo/.claude/RESUME.md"
place plans r "$FR/mainrepo/.claude/RESUME.md" "main RESUME.md"
says "a plan file untouched for a day is stale" "main RESUME.md 1 stale"
mkdir -p "$FR/tmp/handoff-501"; : > "$FR/tmp/handoff-501/next.md"
place plans r "$FR/tmp/handoff-501/next.md" "handoff"
says "a store is drawn by its name" "handoff 1"
cp "$STATUSLINE_STATE/focus-plans.json" "$FIX/plans.json"
jq -c '.places += [{path: "/x", label: "bad mark", mark: "z"}, {path: 3, label: "bad path", mark: "r"}, {path: "/y", label: "", mark: "r"}]' "$FIX/plans.json" > "$STATUSLINE_STATE/focus-plans.json"
missing "a place with a malformed field is left out" "bad"
says "and the well-formed places still draw" "handoff 1"
jq -c '.v = 2' "$FIX/plans.json" > "$STATUSLINE_STATE/focus-plans.json"
missing "a focus file of another version draws no plans row" "☰"
jq -c '.places[0].label = "worktree\t.sdlc/\u001b[31m"' "$FIX/plans.json" > "$STATUSLINE_STATE/focus-plans.json"
says "control characters in a label are spaces, so its fields stay in step" "worktree .sdlc/ [31m 1"
cp "$FIX/plans.json" "$STATUSLINE_STATE/focus-plans.json"
render >/dev/null
if [ -s "$FIX/stderr" ]; then no "the plans row is silent on stderr ($(head -1 "$FIX/stderr"))"
else ok "the plans row is silent on stderr"; fi

echo "== color: dim furniture, and a warning tone only when headroom is low =="
E=$'\033'
PLAIN=""
limits "{\"used_percentage\":41.5,\"resets_at\":\"$(iso_in 3H)\"}" null
says "the box border is dim" "${E}[2m│${E}[0m"
says "the box's top edge and panel titles are dim" "${E}[2m┌─ location "
says "ample headroom carries no tone" "session 58% left ${E}[2m(3h"
says "the reset clock is dim" "${E}[2m(3h"
limits '{"used_percentage":80}' '{"used_percentage":95}'
says "25% left or under is yellow" "session ${E}[33m20% left${E}[0m"
says "the weekly window carries no tone" "week 5% left"
limits '{"used_percentage":95}' null
says "10% left or under is red" "session ${E}[31m5% left${E}[0m"
limits '{"used_percentage":true}' null
says "an unreadable window carries no tone" "session ?% left"
PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"context_window":{"used_percentage":92}}'
says "context at 90% used or over is red" "ctx ${E}[31m92%${E}[0m"
git -C "$FIX/prrepo" remote add origin "git""@github.com:someone/app.git" 2>/dev/null
prcache '482 pass'
at prrepo
says "the PR number links to the PR" "${E}]8;;https://github.com/someone/app/pull/482${E}\\#482${E}]8;;${E}\\"
says "passing checks are green" "${E}[32mchecks pass${E}[0m"
PAYLOAD="{\"session_id\":\"s1\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
says "a worktree's name links to its folder" "${E}]8;;file://$FIX/mainrepo/.claude/worktrees/second${E}\\second"
PAYLOAD="{\"session_id\":\"plans\",\"workspace\":{\"current_dir\":\"$WT\"},\"model\":{\"display_name\":\"M\"}}"
says "a place the session wrote to is green" "${E}[32mworktree .sdlc/${E}[0m 2"
says "a place it only read is dim" "${E}[2mplan${E}[0m 1"
says "a place with a file gone is red, and the colour stands in for the word" "${E}[31mmain .scratch/${E}[0m 1${E}"
says "more than one place is yellow, ▲ and text" "${E}[33m▲ split across 6 places${E}[0m"
printf '{"v":1,"health":9,"level":"goals","plan":"","rows":[],"places":[]}' > "$STATUSLINE_STATE/focus-plans-one.json"
place plans-one w "$WT/.sdlc/spec.md" "worktree .sdlc/"
PAYLOAD="{\"session_id\":\"plans-one\",\"workspace\":{\"current_dir\":\"$WT\"},\"model\":{\"display_name\":\"M\"}}"
says "one place is a green tick" "${E}[32m✓${E}[0m one place"
: > "$WT/.sdlc/old.md"; touch -t 202601010000 "$WT/.sdlc/old.md"
place plans-one b "$WT/.sdlc/old.md" "worktree .sdlc/"
says "a stale file a command only named leaves a place the session wrote to green" "${E}[32mworktree .sdlc/${E}[0m 2"
place plans-one b "$WT/.sdlc/old.md" "main .sdlc/"
says "a stale file a command only named, where nothing was written, marks its place stale" "${E}[31mmain .sdlc/${E}[0m 1"
rm -f "$FIX/sl"/focus-*.json; unset STATUSLINE_STATE
unset PLAIN

echo "== the sub-agent rows =="
SA="$(cd "$(dirname "$0")/.." && pwd)/statusline/subagent-statusline.sh"
agents() { printf '%s' "$1" | STATUSLINE_NOW="${sa_now-}" NO_COLOR="${PLAIN-1}" STATUSLINE_STATE="${STATUSLINE_STATE-$FIX/sl}" bash "$SA" 2>"$FIX/stderr"; }
row() { # <desc> <tasks json> <how it starts> <how it ends> [columns] — and a row with a column after its task is exactly as wide as the panel
  local cols=${5:-100} out; out=$(agents "{\"cwd\":\"/w\",\"columns\":$cols,\"tasks\":[$2]}" | jq -r '.content')
  if [[ "$out" == "$3"* && "$out" == *"$4" ]] && [ "$(printf '%s' "$out" | jq -Rr length)" = "$cols" ]; then ok "$1"
  else no "$1"; printf '       wanted <<%s ... %s>> at %s columns\n       got    <<%s>> at %s\n' "$3" "$4" "$cols" "$out" "$(printf '%s' "$out" | jq -Rr length)"; fi
}
sa_now=$(date +%s)  # the panel reads this clock, so a slow render still sees 100s
start=$(( (sa_now - 100) * 1000 ))
T="{\"id\":\"a\",\"name\":\"reviewer\",\"status\":\"running\",\"label\":\"checking the diff\",\"startTime\":$start,\"model\":\"claude-sonnet-5-5\",\"effort\":\"low\",\"contextWindowSize\":200000,\"tokenCount\":24000,\"tokenSamples\":[1,2],\"cwd\":\"/w/.claude/worktrees/band\"}"
row "a running agent shows name, state, model, effort, task, place and time, in words" "$T" \
  "reviewer  working  Sonnet  low  checking the diff  " "  @band  1m40s"
row "a narrower panel drops the time first" "$T" "reviewer  working  Sonnet  low  checking the diff" "  @band" 58
row "then the model and the effort" "$T" "reviewer  working  checking the diff" "  @band" 45
only() { # <desc> <tasks json> <the whole row> [columns]
  local out; out=$(agents "{\"cwd\":\"/w\",\"columns\":${4:-100},\"tasks\":[$2]}" | jq -r '.content')
  if [ "$out" = "$3" ]; then ok "$1"; else no "$1"; printf '       wanted <<%s>>\n       got    <<%s>>\n' "$3" "$out"; fi
}
only "then the place, and last the task shortens" "$T" "reviewer  working  checking t…" 30
S="{\"id\":\"b\",\"agentType\":\"Explore\",\"status\":\"running\",\"label\":\"find it\",\"tokenSamples\":[5,5,5,5,5,5],\"cwd\":\"/w\"}"
only "an agent with no name goes by its type, and six still readings make it stalled" "$S" "Explore  stalled  find it"
D="{\"id\":\"c\",\"name\":\"code-review\",\"status\":\"completed\",\"label\":\"no findings\",\"cwd\":\"/w\"}"
only "a finished agent says done" "$D" "code-review  done  no findings"
agents "{\"session_id\":\"p1\",\"cwd\":\"/w\",\"columns\":100,\"tasks\":[$T,$S,$D]}" >/dev/null
hue() { jq -rn --arg n "$1" '["36","35","34","32","96","95","94","92"][($n | explode | add) % 8]'; }
if [ "$(cat "$FIX/sl/agents-p1")" = "$(printf '%s\t%s\treviewer\tclaude-sonnet-5-5\tworking\n%s\t%s\tExplore\t-\tstalled' /w/.claude/worktrees/band "$(hue reviewer)" /w "$(hue Explore)")" ]; then
  ok "each running agent's folder, colour, name, model id and state are written for the status line; a finished one is not"
else no "each running agent's folder, colour, name, model id and state are written for the status line ($(cat -t "$FIX/sl/agents-p1"))"; fi
agents "{\"session_id\":\"p1\",\"cwd\":\"/w\",\"tasks\":[$D]}" >/dev/null
if [ ! -s "$FIX/sl/agents-p1" ]; then ok "with no agent running the file empties"; else no "with no agent running the file empties"; fi
if agents "{\"cwd\":\"/w\",\"columns\":100,\"tasks\":[$T,$D]}" | jq -e -s 'map(.id) == ["a","c"]' >/dev/null; then ok "each row answers its own task id"
else no "each row answers its own task id"; fi
PLAIN=""
out=$(agents "{\"cwd\":\"/w\",\"columns\":100,\"tasks\":[$D]}" | jq -r '.content')
case "$out" in *"${E}[2m code-review"*) no "a finished row's body is dim ($out)" ;; *"${E}[2mcode-review"*) ok "a finished row's body is dim" ;; *) no "a finished row's body is dim ($out)" ;; esac
unset PLAIN
agents '{"tasks":[{"id":"x","status":"running"}]}' >/dev/null
if [ -s "$FIX/stderr" ]; then no "a task missing every optional field is silent on stderr ($(head -1 "$FIX/stderr"))"
else ok "a task missing every optional field is silent on stderr"; fi

echo "== the focus row =="
export STATUSLINE_STATE="$FIX/sl"; mkdir -p "$STATUSLINE_STATE"
PAYLOAD="{\"session_id\":\"fz\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
missing "no focus file, no focus row" "HP"
# With no STATUSLINE_STATE, CLAUDE_CONFIG_DIR or HOME there is no folder, so no focus file is looked for; the plugin
# writes none there either. Nothing at /.claude can be made without root, so the trace stands in for the file.
(unset STATUSLINE_STATE CLAUDE_CONFIG_DIR HOME; printf '%s' "$PAYLOAD" | STATUSLINE_NOW="$SL_NOW" NO_COLOR=1 STATUSLINE_PR_GH="$FIX/gh" bash -x "$SL" >/dev/null 2>"$FIX/trace")
if grep -q 'focus-fz\.json' "$FIX/trace"; then no "with no folder named, no focus file is looked for at the filesystem root ($(grep -m1 'focus-fz\.json' "$FIX/trace"))"
else ok "with no folder named, no focus file is looked for at the filesystem root"; fi
if grep -qE "[ =]/(agents|worktrees|pr)-" "$FIX/trace"; then no "with no folder named, no state is read or written at the filesystem root ($(grep -m1 -E "[ =]/(agents|worktrees|pr)-" "$FIX/trace"))"
else ok "with no folder named, no state is read or written at the filesystem root"; fi
# A focus file Blazing Trails' own test expects publish() to write, its JSON what follows `export default`; with a
# root, each place's path is moved under it, so the test can make its files exist, go or age.
FIXTURES="$(dirname "$SL")/../tests/fixtures"
fixture() { # <fixture> <session> [root]
  sed -n '/^export default/,$p' "$FIXTURES/$1.ts" | sed '1s/^export default *//' | jq -c --arg root "${3-}" '.places |= map(.path = $root + .path)' > "$STATUSLINE_STATE/focus-$2.json"
}
fixture focus-file fz
says "the shared fixture draws its row as given" "HP ■■■■■■■■■■□□□□□□□□□□ 5 ! · ↺ REGROUP"
# The folder's fallbacks, an empty variable counting as unset: each file sits only in the folder its row names.
mkdir -p "$FIX/cc/state" "$FIX/home/.claude/state"
cp "$STATUSLINE_STATE/focus-fz.json" "$FIX/cc/state/focus-fz.json"
STATUSLINE_STATE="" HOME="$FIX/nohome" says "with STATUSLINE_STATE empty, the file in CLAUDE_CONFIG_DIR/state draws" "HP ■■■■■■■■■■□□□□□□□□□□ 5 ! · ↺ REGROUP"
mv "$FIX/cc/state/focus-fz.json" "$FIX/home/.claude/state/focus-fz.json"
STATUSLINE_STATE="" CLAUDE_CONFIG_DIR="" HOME="$FIX/home" says "with both empty, the file in ~/.claude/state draws" "HP ■■■■■■■■■■□□□□□□□□□□ 5 ! · ↺ REGROUP"
STATUSLINE_STATE="" HOME="$FIX/home" missing "with CLAUDE_CONFIG_DIR set, ~/.claude/state is not read" "HP"
rm "$FIX/home/.claude/state/focus-fz.json"
PLAIN="" says "in colour, a bold part with colour 3 is bold yellow" $'\033[1;33mHP\033[0m'
PLAIN="" says "in colour, each part is reset after it, and a dim part is dim" $'\033[33m■■■■■■■■■■\033[0m\033[2m□□□□□□□□□□\033[0m'
PLAIN="" says "in colour, colour 1 is red" $'\033[31m↺ REGROUP\033[0m'
jq '.rows[0][2].color = "ansi256(11)" | .rows[0][7] += {bold: true}' "$STATUSLINE_STATE/focus-fz.json" > "$FIX/f.json" && mv "$FIX/f.json" "$STATUSLINE_STATE/focus-fz.json"
PLAIN="" says "colours 8 to 15 are the bright ones" $'\033[93m■■■■■■■■■■\033[0m'
PLAIN="" says "bold and a colour join in one code" $'\033[1;31m↺ REGROUP\033[0m'
fixture focus-file fz
jq '.v = 2' "$STATUSLINE_STATE/focus-fz.json" > "$FIX/f.json" && mv "$FIX/f.json" "$STATUSLINE_STATE/focus-fz.json"
missing "a file of another version shows no focus row" "HP"
fixture focus-file fz
jq '.rows[0][2].color = "ansi256(16)"' "$STATUSLINE_STATE/focus-fz.json" > "$FIX/f.json" && mv "$FIX/f.json" "$STATUSLINE_STATE/focus-fz.json"
missing "a colour outside the 16 shows no focus row" "HP"
fixture focus-file fz
jq '.rows[0][0].text = 7' "$STATUSLINE_STATE/focus-fz.json" > "$FIX/f.json" && mv "$FIX/f.json" "$STATUSLINE_STATE/focus-fz.json"
missing "a part whose text is not a string shows no focus row" "HP"
fixture focus-file fz
jq '.rows[0][0].text = "H\u001b[31mP\nX"' "$STATUSLINE_STATE/focus-fz.json" > "$FIX/f.json" && mv "$FIX/f.json" "$STATUSLINE_STATE/focus-fz.json"
says "control characters in a part are dropped, so it stays one row" "H[31mPX ■"
printf '{"health":9,"level":"clear","plan":"p"}' > "$STATUSLINE_STATE/focus-fz.json"
missing "a file with no rows shows no focus row" "HP"
printf 'not json' > "$STATUSLINE_STATE/focus-fz.json"
missing "a file that is not JSON shows no focus row" "HP"
fixture focus-file fz; chmod 000 "$STATUSLINE_STATE/focus-fz.json"
missing "an unreadable file shows no focus row" "HP"
chmod 600 "$STATUSLINE_STATE/focus-fz.json"
fixture focus-file fz
if render >/dev/null && [ ! -s "$FIX/stderr" ]; then ok "the focus row writes nothing to stderr"; else no "the focus row writes nothing to stderr ($(head -1 "$FIX/stderr"))"; fi
says "the shared fixture's place draws its plans row, its file gone" "☰ w docs/plans/ 1 gone   ✓ one place"
follows "the plans row sits directly under the focus row" "REGROUP" "☰ "
follows "and the box top follows the plans row" "one place" "┌─ location"
PR="$FIX/placed"
mkdir -p "$PR/w/docs/plans" "$PR/home/w/.claude/plans" "$PR/w/.sdlc"
: > "$PR/w/docs/plans/a.md"; : > "$PR/home/w/.claude/plans/calm.md"; : > "$PR/w/.sdlc/spec.md"
fixture focus-places fp "$PR"
PAYLOAD="{\"session_id\":\"fp\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
says "the places fixture draws its HP row as given" "HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS"
says "a place for each file written, read or named, in the order first touched" "☰ w docs/plans/ 1 · plan 1 · w .sdlc/ 1   ▲ split across 3 places"
PLAIN="" says "the place written is green" $'\033[32mw docs/plans/\033[0m 1'
PLAIN="" says "the place only read is dim" $'\033[2mplan\033[0m 1'
PLAIN="" says "the place only named is dim" $'\033[2mw .sdlc/\033[0m 1'
rm "$PR/home/w/.claude/plans/calm.md"
says "the file read, gone, marks its place" "plan 1 gone"
rm "$PR/w/.sdlc/spec.md"
missing "the file named, gone, was a search pattern and has no place" "w .sdlc/"
PRW="$FIX/row"
mkdir -p "$PRW/w/docs/plans"; : > "$PRW/w/docs/plans/p.md"; : > "$PRW/q.md"
fixture plan-row pr "$PRW"
# The SGR code of a colour the fixture names, as ansi256(n): 30 + n for the first eight, 82 + n for the bright ones.
sgr() { jq -r --arg k "$1" '.colours[$k] | ltrimstr("ansi256(") | rtrimstr(")") | tonumber | if . < 8 then 30 + . else 82 + . end' "$STATUSLINE_STATE/focus-pr.json"; }
PAYLOAD="{\"session_id\":\"pr\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
says "the plan row is drawn as the sidebar describes it" "$(jq -r .drawn "$STATUSLINE_STATE/focus-pr.json")"
PLAIN="" says "a place written is in the colour the sidebar names" $'\033['"$(sgr written)"'mworktree docs/plans/'
PLAIN="" says "one place is a tick in the colour the sidebar names" $'\033['"$(sgr one)"$'m\u2713'
rm "$PRW/w/docs/plans/p.md"
PLAIN="" says "a place whose file is gone is in the colour the sidebar names" $'\033['"$(sgr gone)"'mworktree docs/plans/'
place pr r "$PRW/q.md" "plan"
PLAIN="" says "places split are in the colour the sidebar names" $'\033['"$(sgr split)"$'m\u25b2 split'
rm -f "$FIX/sl"/focus-*.json; unset STATUSLINE_STATE

echo "== the box: the location, worktree, model and usage panels and the agents =="
git -C "$FIX/mainrepo" worktree add -q "$FIX/mainrepo/.claude/worktrees/same" -b worktree-same 2>/dev/null
PAYLOAD="{\"session_id\":\"lay\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/same\"},\"model\":{\"display_name\":\"M\"}}"
says "a branch that is worktree-<tree> is not repeated" "│ mainrepo   │ same       │"
missing "a branch that is worktree-<tree> is not repeated, even in the tree's own line" "same ▸"
printf -- '-\n' | tee "$FIX/sl/pr-mainrepo__worktree-same" "$FIX/sl/pr-mainrepo__feature" "$FIX/sl/pr-other__ext" >/dev/null
box_of() { render | awk '/^┌/ { p = 1 } p'; }
# displayed columns of each row: colour and link sequences take none, a character takes one
cols() { sed -e $'s/\033\\[[0-9;]*m//g' -e $'s/\033\\][^\033]*\033\\\\//g' | LC_ALL=en_US.UTF-8 bash -c 'while IFS= read -r l; do echo ${#l}; done' | sort -u | tr '\n' ' '; }
widths() { box_of | cols; }

printf '%s\n' "$FIX/mainrepo/.claude/worktrees/same" > "$FIX/sl/worktrees-lay"
rows_are "with no other worktree and no agent the box has its three panels" "┌─ location ─┬─ worktree ─┬─ model ─┐
│ mainrepo   │ same       │ M       │
└────────────┴────────────┴─────────┘"
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/same" "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/worktrees-lay"
rows_are "one other worktree is one row under a blank one, + repo beside its folder and state" "┌─ location ─┬─ worktree ─────────────┬─ model ─┐
│ mainrepo   │ same                   │ M       │
│            │                        │         │
│ + mainrepo │ feature ▸ feature idle │         │
└────────────┴────────────────────────┴─────────┘"
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/same" "$FIX/mainrepo/.claude/worktrees/feature" "$FIX/other/.claude/worktrees/ext" "$FIX/other/.claude/worktrees/ext2" "$FIX/mainrepo/.claude/worktrees/second" > "$FIX/sl/worktrees-lay"
rows_are "three other worktrees are two rows and the count of the rest" "┌─ location ─┬─ worktree ─────────────┬─ model ─┐
│ mainrepo   │ same                   │ M       │
│            │                        │         │
│ + mainrepo │ feature ▸ feature idle │         │
│ + other    │ ext ▸ ext idle         │         │
│            │ +2 more                │         │
└────────────┴────────────────────────┴─────────┘"
[ "$(widths | wc -w | tr -d ' ')" = 1 ] && ok "every box line is as wide as the top edge" || no "every box line is as wide as the top edge ($(widths))"
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/same" "$FIX/mainrepo/.claude/worktrees/feature" "$FIX/other/.claude/worktrees/ext" > "$FIX/sl/worktrees-lay"

printf '%s\t36\tzz\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/agents-lay"
rows_are "an agent in another worktree is named on that worktree's row" "┌─ location ─┬─ worktree ───────────────────┬─ model ─┐
│ mainrepo   │ same                         │ M       │
│            │                              │         │
│ + mainrepo │ feature ▸ feature zz working │         │
│ + other    │ ext ▸ ext idle               │         │
└────────────┴──────────────────────────────┴─────────┘"
[ "$(widths | wc -w | tr -d ' ')" = 1 ] && ok "with agents every box line is as wide as the top edge" || no "with agents every box line is as wide as the top edge ($(widths))"

printf '%s\t36\treviewer-of-a-long-name\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo" > "$FIX/sl/agents-lay"
printf '' > "$FIX/sl/worktrees-lay"
rows_are "an agents row wider than the panels widens the box, the usage panel taking the room" "┌─ location ─┬─ worktree ─┬─ model ─┐
│ mainrepo   │ same       │ M       │
└────────────┴────────────┴─────────┘"
rm -f "$FIX/sl/agents-lay" "$FIX/sl/worktrees-lay"

echo "== the box: long names, usage windows and plain mode =="
PLAIN=1
mkrepo averyveryverylongrepositoryname-with-a-tail trunk
rm -f "$FIX/sl/agents-lay" "$FIX/sl/worktrees-lay"
PAYLOAD="{\"workspace\":{\"current_dir\":\"$FIX/averyveryverylongrepositoryname-with-a-tail\",\"repo\":{\"name\":\"averyveryverylongrepositoryname-with-a-tail\"}},\"model\":{\"display_name\":\"A model with a name far longer than the panel\"},\"effort\":{\"level\":\"medium\"}}"
says "a long repo name ends in … within the location panel" "│ averyveryverylongreposi… │"
says "a long model name ends in … within the model panel" "│ A model with a name… │"
[ "$(widths)" = "64 " ] && ok "a box with long names is as wide as its panels" || no "a box with long names is as wide as its panels ($(widths))"
unset PLAIN
limits "{\"used_percentage\":70,\"resets_at\":$(epoch_in 7200)}" "{\"used_percentage\":85,\"resets_at\":$(epoch_in 190000)}"
rows_are "sess with its reset and burn warning, and wk each keep their value on a line of the usage panel" "┌─ location ─┬─ worktree ─┬─ model ──────────────────────────────┐
│ /tmp       │            │ M                                    │
├─ usage ────┴────────────┴──────────────────────────────────────┤
│ session 30% left (2h00m) out in 1h17m  ·  week 15% left (2d4h) │
└────────────────────────────────────────────────────────────────┘"
PAYLOAD='{"workspace":{"current_dir":"/tmp"},"model":{"display_name":"M"},"effort":{"level":"low"},"context_window":{"used_percentage":41},"rate_limits":{"five_hour":{"used_percentage":1},"seven_day":{"used_percentage":85}}}'
rows_are "ctx, session and week each take a line, the effort under the model" "┌─ location ─┬─ worktree ─┬─ model ──────────────┐
│ /tmp       │            │ M                    │
│            │            │ low effort           │
├─ usage ────┴────────────┴──────────────────────┤
│ ctx 41%  ·  session 99% left  ·  week 15% left │
└────────────────────────────────────────────────┘"
PLAIN=""
out=$(render)
vis_widths=$(printf '%s\n' "$out" | cols)
[ "$(echo $vis_widths | wc -w | tr -d ' ')" = 1 ] && ok "in colour every box line is as wide as the top edge, escape codes taking no columns" || no "in colour every box line is as wide as the top edge ($vis_widths)"
unset PLAIN
case "$out" in *"${E}[2m│${E}[0m"*) ok "the border is dim" ;; *) no "the border is dim" ;; esac
case "$out" in *"${E}[2m└"*) ok "the bottom edge is dim" ;; *) no "the bottom edge is dim" ;; esac
git -C "$FIX/mainrepo" worktree add -q "$FIX/mainrepo/.claude/worktrees/a-tree-named-far-too-long-for-the-panel" -b worktree-a-tree-named-far-too-long-for-the-panel 2>/dev/null
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/a-tree-named-far-too-long-for-the-panel" "$FIX/mainrepo/.claude/worktrees/second" > "$FIX/sl/worktrees-lay"
printf '%s\t36\tzz\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo/.claude/worktrees/a-tree-named-far-too-long-for-the-panel" > "$FIX/sl/agents-lay"
PAYLOAD="{\"session_id\":\"lay\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"}}"
PLAIN=""
out=$(render)
unset PLAIN
[ "$(printf '%s\n' "$out" | cols | wc -w | tr -d ' ')" = 1 ] && ok "a shortened link and its colour still make every line as wide, with agents" || no "a shortened link and its colour still make every line as wide, with agents ($(printf '%s\n' "$out" | cols))"
case "$out" in *"…${E}[0m${E}]8;;${E}\\"*) ok "a link cut short is closed" ;; *) no "a link cut short is closed" ;; esac
rm -f "$FIX/sl/agents-lay" "$FIX/sl/worktrees-lay"

echo "== the box: four panels, the fallback to three, the joints and long names =="
rm -f "$FIX/sl/agents-lay" "$FIX/sl/worktrees-lay"
printf -- '-\n' > "$FIX/sl/pr-mainrepo__trunk"; printf '482\n' > "$FIX/sl/pr-mainrepo__second"; printf '12\n' > "$FIX/sl/pr-mainrepo__feature"
LONGWT="$FIX/mainrepo/.claude/worktrees/a-worktree-folder-named-much-too-long-to-show-in-its-panel"
git -C "$FIX/mainrepo" worktree add -q "$LONGWT" -b a-branch-that-is-not-the-folder-name-at-all 2>/dev/null
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/worktrees-fp"
printf '%s\t36\treviewer\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/agents-fp"
LIM=',"rate_limits":{"five_hour":{"used_percentage":70},"seven_day":{"used_percentage":85}}'
LIM_CLOCKS=",\"rate_limits\":{\"five_hour\":{\"used_percentage\":70,\"resets_at\":$(epoch_in 7200)},\"seven_day\":{\"used_percentage\":85,\"resets_at\":$(epoch_in 190000)}}"
fp() { # <dir> [no-model] — a session "fp" in <dir>, with the effort and ctx, and a model name unless told not
  local m=',"model":{"display_name":"Sonnet 5.5"}'
  [ -z "${2:-}" ] || m=""
  [ -z "${CLOCKS:-}" ] || LIM=$LIM_CLOCKS
  PAYLOAD="{\"session_id\":\"fp\",\"workspace\":{\"current_dir\":\"$1\"}$m,\"effort\":{\"level\":\"medium\"},\"context_window\":{\"used_percentage\":45}$LIM}"
}
fp "$FIX/mainrepo/.claude/worktrees/second"
rows_are "a worktree session with an agent working in the other worktree: the repo in location, the folder in worktree, a blank row, the other worktree beside its repo, then model and usage" "┌─ location ─┬─ worktree ─────────────────────────────┬─ model ───────┐
│ mainrepo   │ second ▸ second #482                   │ Sonnet 5.5    │
│            │                                        │ medium effort │
│ + mainrepo │ feature ▸ feature #12 reviewer working │               │
├─ usage ────┴────────────────────────────────────────┴───────────────┤
│ ctx 45%  ·  session 30% left  ·  week 15% left                      │
└─────────────────────────────────────────────────────────────────────┘"
rm -f "$FIX/sl/agents-fp"
rows_are "a worktree session: the repo in location, the folder in worktree, a blank row, the other worktree beside its repo, then model and usage in full words" "┌─ location ─┬─ worktree ─────────────────┬─ model ───────┐
│ mainrepo   │ second ▸ second #482       │ Sonnet 5.5    │
│            │                            │ medium effort │
│ + mainrepo │ feature ▸ feature #12 idle │               │
├─ usage ────┴────────────────────────────┴───────────────┤
│ ctx 45%  ·  session 30% left  ·  week 15% left          │
└─────────────────────────────────────────────────────────┘"
printf '%s\t36\treviewer\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/agents-fp"
fp "$FIX/mainrepo"
says "the main checkout's worktree column is the branch" "│ mainrepo   │ trunk"
says "another worktree is one row across the location and worktree columns" "│ + mainrepo │ feature ▸ feature "
fp "$FIX/mainrepo" none
rows_are "with no model name the model panel is not drawn and the box has three panels" "┌─ location ─┬─ worktree ─────────────────────────────┐
│ mainrepo   │ trunk                                  │
│            │                                        │
│ + mainrepo │ feature ▸ feature #12 reviewer working │
├─ usage ────┴────────────────────────────────────────┤
│ ctx 45%  ·  session 30% left  ·  week 15% left      │
└─────────────────────────────────────────────────────┘"
fp "$FIX/mainrepo/.claude/worktrees/second"
joints() { # <row> <character> — the columns holding it
  printf '%s\n' "$1" | LC_ALL=en_US.UTF-8 bash -c 'read -r l; for ((i = 0; i < ${#l}; i++)); do [ "${l:i:1}" = "$1" ] && printf "%s " "$i"; done' _ "$2"
}
for _case in four three; do
  if [ "$_case" = three ]; then fp "$FIX/mainrepo/.claude/worktrees/second" none; else fp "$FIX/mainrepo/.claude/worktrees/second"; fi
  _out=$(render)
  _t=$(joints "$(printf '%s\n' "$_out" | grep '^┌')" ┬); _d=$(joints "$(printf '%s\n' "$_out" | grep '^├')" ┴)
  _b=$(printf '%s\n' "$_out" | grep '^│' | head -1); _bars=$(joints "$_b" │)
  [ -n "$_t" ] && [ "$_t" = "$_d" ] && ok "the ┴ joints sit under each ┬ border with $_case panels ($_t)" || no "the ┴ joints sit under each ┬ border with $_case panels (top <$_t> divider <$_d>)"
  _last=$(( $(printf '%s\n' "$_b" | cols) - 1 ))
  [ "$_bars" = "0 $_t$_last " ] && ok "the borders of a row stand where the joints are with $_case panels" || no "the borders of a row stand where the joints are with $_case panels (row <$_bars> joints <$_t>)"
done
CLOCKS=1 fp "$LONGWT"
_out=$(render)
[ "$(printf '%s\n' "$_out" | cols)" = "$(printf '%s\n' "$_out" | awk 'NR==1' | cols)" ] && [ "$(printf '%s\n' "$_out" | cols | tr -d ' ')" -le 100 ] && ok "long names keep every line of the box as wide as its top edge, at most 100 columns" || no "long names keep every line of the box as wide as its top edge, at most 100 columns ($(printf '%s\n' "$_out" | cols))"
grep -q 'a-worktree-folder-named-much-too-long-t…' <<< "$_out" && ok "a long worktree folder ends in … within the worktree panel" || no "a long worktree folder ends in … within the worktree panel ($_out)"
grep -qF 'ctx 45%  ·  session 30% left (' <<< "$_out" && ok "usage keeps the long labels on one row when it fits in 100 columns" || no "usage keeps the long labels on one row when it fits in 100 columns"
rm -f "$FIX/sl/agents-fp" "$FIX/sl/worktrees-fp"

echo "== without a UTF-8 locale the box is ASCII and as wide =="
PAYLOAD="{\"session_id\":\"lay\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo\"},\"model\":{\"display_name\":\"M\"},\"effort\":{\"level\":\"low\"},\"context_window\":{\"used_percentage\":5},\"rate_limits\":{\"five_hour\":{\"used_percentage\":10},\"seven_day\":{\"used_percentage\":20}}}"
printf '%s\t36\tzz\tclaude-opus-5-5\tworking\n' "$FIX/mainrepo" > "$FIX/sl/agents-lay"
printf '%s\n' "$FIX/mainrepo/.claude/worktrees/feature" > "$FIX/sl/worktrees-lay"
ascii=$(printf '%s' "$PAYLOAD" | LC_ALL=C STATUSLINE_LOCALES=none NO_COLOR=1 STATUSLINE_STATE="${STATUSLINE_STATE-$FIX/sl}" bash "$SL" 2>/dev/null)
LC_ALL=C grep -q '[^ -~]' <<< "$ascii" && no "no UTF-8 locale gives plain ASCII ($ascii)" || ok "no UTF-8 locale gives plain ASCII"
[ "$(echo "$ascii" | awk '{ print length($0) }' | sort -u | tr '\n' ' ')" = "$(echo "$ascii" | wc -L | tr -d ' ') " ] && ok "the ASCII box is as wide on every line" || no "the ASCII box is as wide on every line"
utf=$(printf '%s' "$PAYLOAD" | LC_ALL=C NO_COLOR=1 STATUSLINE_STATE="${STATUSLINE_STATE-$FIX/sl}" bash "$SL" 2>/dev/null)
grep -q '┌─ location' <<< "$utf" && ok "a C locale is switched to UTF-8 and draws the box characters" || no "a C locale is switched to UTF-8 and draws the box characters"
STATUSLINE_STATE="$FIX/sl" fixture focus-file lay
ascii=$(printf '%s' "$PAYLOAD" | STATUSLINE_STATE="$FIX/sl" LC_ALL=C STATUSLINE_LOCALES=none NO_COLOR=1 bash "$SL" 2>/dev/null)
grep -qF 'HP ##########---------- 5 ! - REGROUP' <<< "$ascii" && ok "with no UTF-8 locale the focus row draws each part's ASCII text" || no "with no UTF-8 locale the focus row draws each part's ASCII text ($ascii)"
LC_ALL=C grep -q '[^ -~]' <<< "$ascii" && no "the focus row keeps the output plain ASCII ($ascii)" || ok "the focus row keeps the output plain ASCII"
rm -f "$FIX/sl/agents-lay" "$FIX/sl/worktrees-lay" "$FIX/sl/focus-lay.json"

echo "== the palette is the theme's =="
if command grep -q '38;5;\|38;2;\|48;5;' "$(dirname "$SL")/statusline.sh" "$(dirname "$SL")/subagent-statusline.sh"; then no "no fixed 256-colour or RGB code remains in either script"
else ok "no fixed 256-colour or RGB code remains in either script"; fi


echo "== one render's jq and git processes =="
# Counted by shims ahead of the real tools on PATH, for a render in a worktree with a session, both rate-limit windows
# and a cached PR: the payload is read in one jq, and the checkout is asked for its branch, its git folders in one
# call, and the PR's remote.
mkdir -p "$FIX/shim"
for tool in jq git; do
  printf '#!/bin/bash\necho "%s $*" >> "%s"\nexec "%s" "$@"\n' "$tool" "$FIX/calls" "$(command -v "$tool")" > "$FIX/shim/$tool"
  chmod +x "$FIX/shim/$tool"
done
: > "$FIX/calls"
printf '%s' "{\"session_id\":\"s9\",\"workspace\":{\"current_dir\":\"$FIX/mainrepo/.claude/worktrees/feature\"},\"model\":{\"display_name\":\"M\"},\"effort\":{\"level\":\"high\"},\"context_window\":{\"used_percentage\":40},\"rate_limits\":{\"five_hour\":{\"used_percentage\":41,\"resets_at\":\"$(iso_in 3H)\"},\"seven_day\":{\"used_percentage\":5,\"resets_at\":\"$(iso_in 3H)\"}}}" \
  | PATH="$FIX/shim:$PATH" STATUSLINE_NOW="$SL_NOW" NO_COLOR=1 STATUSLINE_STATE="$FIX/sl" STATUSLINE_PR_GH="$FIX/gh" bash "$SL" > "$FIX/counted" 2>/dev/null
jqs=$(grep -c '^jq ' "$FIX/calls"); gits=$(grep -c '^git ' "$FIX/calls")
if grep -qF 'feature' "$FIX/counted" && grep -qF 'session 59% left' "$FIX/counted"; then ok "the counted render draws its rows"; else no "the counted render draws its rows"; fi
if [ "$jqs" -eq 1 ]; then ok "the payload is read in one jq"; else no "the payload is read in one jq (ran $jqs)"; fi
if [ "$gits" -le 3 ]; then ok "the checkout is asked three things: its branch, its git folders and its PR's remote"; else no "the checkout is asked three things (ran $gits)"; grep '^git ' "$FIX/calls" | sed 's/^/       /'; fi
PAYLOAD='{"workspace":{"current_dir":"/tmp","repo":"r"},"model":{"display_name":"M"},"effort":"high","context_window":{"used_percentage":40}}'
says "a payload field of the wrong shape blanks only itself" "ctx 40%"

unset PLAIN

echo
echo "statusline: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
