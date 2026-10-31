#!/usr/bin/env bash
# Blazing Trails' status line. The plugin keeps a copy in its data folder at each session start, and
# /ortonom:statusline points the person's statusLine setting at that copy.
# Outputs one row per line:
#   HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬆ CLEAR GOAL   Blazing Trails' focus row; absent when it has written none
#   ☰ worktree .oneshot/ 2 · plan 1   ▲ split across 2 places   the plan files this session touched, by place; absent when none; directly under the focus row
#   then a box of three panels over a usage row:
#   ┌─ location ──────┬─ worktree ───────────────┬─ model ────────────────────┐
#   │ my-app          │ fix-login                │ Sonnet 5.5                 │
#   │ bot: login-fix  │                          │ medium effort              │
#   │ + my-api        │ add-tests                │                            │
#   ├─ usage ─────────┴──────────────────────────┴────────────────────────────┤
#   │ ctx 45%  ·  session 93% left (3h48m)  ·  week 13% left (1d15h)          │
#   └─────────────────────────────────────────────────────────────────────────┘
#   location: the repo, then "bot: <session name>" when the session has one, then a blank row and "+ repo" for each other worktree the session opened, in the rows of the worktree column.
#   worktree: the session's worktree folder, or the branch in the main checkout, with ▸ branch when it is not worktree-<tree>,
#   its PR and checks; then each other worktree's folder with its PR, two at most and then "+N more". Sub-agents stay
#   off the box; the agent panel draws them.
#   model: the display name, then "<effort> effort"; the box has two panels when there is no model name.
#   usage: one row of ctx used, then the 5-hour session and weekly windows with what is left, when each resets and when
#   the session runs out; "sess" and "wk" stand in for "session" and "week" when the row would pass the box's width.
#   A panel is as wide as its content, the box at most 100 columns; longer text ends in "…".

input=$(cat)

# GNU coreutils (Linux) spell a file's age and size and a timestamp's parse differently from macOS's BSD tools.
_gnu=$(date --version >/dev/null 2>&1 && echo 1)
_mtime() { if [ -n "$_gnu" ]; then stat -c %Y "$1"; else stat -f %m "$1"; fi 2>/dev/null; }

# Every payload field the line draws, read in one jq; an absent field, one of the wrong shape, or a payload that is not
# JSON leaves its variable empty, and only its own. tostring keeps a non-scalar value on one line.
cwd="" repo="" _sid="" bot="" model="" effort="" ctx=""
_rl_five_hour_used="" _rl_five_hour_resets="" _rl_seven_day_used="" _rl_seven_day_resets=""
eval "$(printf '%s' "$input" | jq -r '
  def field($name; v): (try (v // empty) catch empty) | tostring | $name + "=" + @sh;
  field("cwd"; .workspace.current_dir),
  field("repo"; .workspace.repo.name),
  field("_sid"; .session_id),
  field("bot"; .session_name),
  field("model"; .model.display_name),
  field("effort"; .effort.level),
  field("ctx"; .context_window.used_percentage),
  field("_rl_five_hour_used"; .rate_limits.five_hour.used_percentage),
  field("_rl_five_hour_resets"; .rate_limits.five_hour.resets_at),
  field("_rl_seven_day_used"; .rate_limits.seven_day.used_percentage),
  field("_rl_seven_day_resets"; .rate_limits.seven_day.resets_at)' 2>/dev/null)"

# Repo name + git branch — use workspace current_dir, skip optional locks.
# The git calls are safe no-ops (stderr suppressed, empty result) when cwd
# isn't inside any git repo, so a non-git parent dir never errors here.
# A linked worktree's --git-dir is <main>/.git/worktrees/<name> and differs from
# --git-common-dir; the primary's are equal. Absolute paths, since the bare forms are
# ".git" for both in the primary. --git-common-dir points at the main repo's .git
# from inside any of its worktrees, so the repo is named from it.
branch="" wt="" _gd="" _gcd=""
if [ -n "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
  { read -r _gd; read -r _gcd; } < <(git -C "$cwd" --no-optional-locks rev-parse \
      --path-format=absolute --git-dir --git-common-dir 2>/dev/null)
  if [ -z "$repo" ]; then
    case "$_gcd" in
      */.git) repo=$(basename "${_gcd%/.git}") ;;
      *)  # bare repo, GIT_DIR override, or a git too old for --path-format (2.31+).
          toplevel=$(git -C "$cwd" --no-optional-locks rev-parse --show-toplevel 2>/dev/null)
          [ -n "$toplevel" ] && repo=$(basename "$toplevel") ;;
    esac
  fi
  if [ -n "$_gd" ] && [ -n "$_gcd" ] && [ "$_gd" != "$_gcd" ]; then
    wt=$(basename "$_gd")
  fi
fi

# The state folder, for the focus file, the PR cache and the session's worktrees: STATUSLINE_STATE, else
# CLAUDE_CONFIG_DIR/state, else ~/.claude/state, an empty variable counting as unset. With none of them there is no
# folder, and nothing is read or written.
_state="${STATUSLINE_STATE:-${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/state}}"
_state="${_state:-${HOME:+$HOME/.claude/state}}"

# NO_COLOR renders the line as plain text.
if [ -n "${NO_COLOR:-}" ]; then DIM=""; YEL=""; RED=""; GRN=""; RST=""
else DIM=$'\033[2m'; YEL=$'\033[33m'; RED=$'\033[31m'; GRN=$'\033[32m'; RST=$'\033[0m'; fi

# The box counts one column per character, which ${#s} gives only in a UTF-8 locale; with none, the
# box and its marks are ASCII. STATUSLINE_LOCALES names the locales to try.
_mark='▸'; _glyphs=""
for _l in "" ${STATUSLINE_LOCALES:-en_US.UTF-8 C.UTF-8}; do
  _n=$( { [ -z "$_l" ] || LC_ALL=$_l; printf %s "${#_mark}"; } 2>/dev/null )
  if [ "$_n" = 1 ]; then _glyphs=1; [ -z "$_l" ] || LC_ALL=$_l; break; fi
done
if [ -n "$_glyphs" ]; then
  _ARW='▸'; _ELL='…'; _H='─'; _V='│'; _TL='┌'; _TR='┐'; _BL='└'; _BR='┘'; _TJ='┬'; _BJ='┴'; _LJ='├'; _RJ='┤'; _DOT='·'; _PLANS='☰'; _ONE='✓'; _SPLIT='▲'
else
  _ARW='>'; _ELL='~'; _H='-'; _V='|'; _TL='+'; _TR='+'; _BL='+'; _BR='+'; _TJ='+'; _BJ='+'; _LJ='+'; _RJ='+'; _DOT='-'; _PLANS='='; _ONE='+'; _SPLIT='!'
fi

# A terminal link around text; plain text when colour is off, since a link is an escape sequence too.
_link() { # <url> <text>
  if [ -n "$RST" ] && [ -n "$1" ]; then printf '\033]8;;%s\033\\%s\033]8;;\033\\' "$1" "$2"; else printf '%s' "$2"; fi
}

# The PR's checks from `gh pr list --json number,statusCheckRollup`: "482 pass", "482 pending",
# "482 fail" or "482 none".
_CHECKS='.[0] // empty | (.statusCheckRollup // []) as $c | "\(.number) \(
  if ($c | length) == 0 then "none"
  elif any($c[]; (.conclusion // .state // "") | test("FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE")) then "fail"
  elif any($c[]; ((.status // "COMPLETED") != "COMPLETED") or ((.state // "") | test("PENDING|EXPECTED"))) then "pending"
  else "pass" end)"'

# PR number for a branch — read from a cache, never fetched inline.
#
# `gh pr list` takes about a second against the network, and the line re-renders every 5s (the refreshInterval of
# the person's statusLine setting), so this path only reads a cache file and a detached child refreshes it. Nothing
# here blocks or reaches the network.
#
# CONTRACT: the cache file's CONTENT carries three facts the renderer must keep apart —
# digits mean an open PR, "-" means the branch has none (a settled answer, not a missing
# one), and empty means not learned yet. Only digits render. A second word after the digits
# is the PR's checks: pass, pending, fail or none. Its MTIME is the refresh stamp, so a
# fetch that dies still costs one TTL rather than re-forking every render.
_pr_of() { # <checkout> <branch> [repo] -> sets PR_N to the open PR's number and PR_CK to its checks
  local dir="$1" br="$2" rp="${3:-$repo}" key file cached="" checks="" gh ttl
  PR_N=""; PR_CK=""
  [ -n "$dir" ] && [ -n "$br" ] && [ -n "$_state" ] || return 0
  # Branch names carry slashes (restore/endorsed-copy-edits) — flatten to one flat key.
  key="${rp:-norepo}__${br}"
  key="${key//\//-}"
  file="$_state/pr-${key}"
  [ -r "$file" ] && read -r cached checks _ < "$file" 2>/dev/null
  case "$cached" in
    ''|*[!0-9]*) ;;          # "-", unknown, or a shape we do not understand — show nothing
    *) PR_N=$cached; PR_CK=$checks ;;
  esac

  # CONTRACT: STATUSLINE_PR_GH exists so statusline.test.sh can point this at a stub —
  # the real lookup talks to GitHub and must never run from a test.
  gh="${STATUSLINE_PR_GH:-gh}"
  ttl="${STATUSLINE_PR_TTL_MIN:-5}"
  case "$ttl" in ''|*[!0-9]*) ttl=5 ;; esac
  if [ -z "$(find "$file" -maxdepth 0 -mmin "-$ttl" 2>/dev/null)" ] \
     && command -v "$gh" >/dev/null 2>&1; then
    # DECISION: stamp by touching the cache file BEFORE forking — if the child is reaped
    # (this script's process group is short-lived) we lose one refresh and retry next
    # window, where stamping afterwards would re-fork every 5 seconds forever. touch
    # preserves whatever value is already there, so a stale-but-true number keeps
    # rendering while the refresh is in flight.
    if mkdir -p "$_state" 2>/dev/null && touch "$file" 2>/dev/null; then
      (
        (
          cd "$dir" 2>/dev/null || exit 0
          # --state open, not `gh pr view`: view resolves a branch's most RECENT PR and
          # would keep printing #482 for weeks after it merged.
          n=$("$gh" pr list --head "$br" --state open --limit 1 \
                --json number,statusCheckRollup --jq "$_CHECKS" 2>/dev/null)
          case "${n%% *}" in ''|*[!0-9]*) n=- ;; esac
          printf '%s\n' "$n" > "$file"
        ) >/dev/null 2>&1 &
      ) >/dev/null 2>&1
    fi
  fi
}

# The PR's web address, from the checkout's origin remote; local git only.
_pr_url() { # <checkout> <number>
  local url
  url=$(git -C "$1" --no-optional-locks remote get-url origin 2>/dev/null)
  case "$url" in
    *@github.com:*) url="https://github.com/${url#*@github.com:}" ;;
    https://github.com/*) ;;
    *) return 0 ;;
  esac
  printf '%s/pull/%s' "${url%.git}" "$2"
}

# " #482 checks pass" for the PR _pr_of last read, the number a link to it; "" when there is none.
_pr_seg() { # <checkout>
  [ -n "$PR_N" ] || return 0
  local mark=""
  case "$PR_CK" in
    pass) mark=" ${GRN}checks pass${GRN:+$RST}" ;;
    pending) mark=" ${YEL}checks running${YEL:+$RST}" ;;
    fail) mark=" ${RED}checks failing${RED:+$RST}" ;;
  esac
  printf ' %s%s' "$(_link "$(_pr_url "$1" "$PR_N")" "#$PR_N")" "$mark"
}


# The session's worktrees are the paths in worktrees-<session_id>, one a line: the plugin's hook marks each worktree the
# session enters (hooks/worktrees.ts), and any other tool may add a line. Each gets a row of the worktree panel with its
# own branch's PR, its repo in the location column; the cwd's own worktree, one that is gone, or one that is not a linked
# worktree is skipped.
_th=(); _tr=(); _tx_=(); _tt=()
if [ -n "$_sid" ] && [ -n "$_state" ] && [ -r "$_state/worktrees-$_sid" ]; then
  while IFS= read -r _tree; do
    [ -d "$_tree" ] || continue
    _tgd=""; _tgcd=""
    { read -r _tgd; read -r _tgcd; } < <(git -C "$_tree" --no-optional-locks rev-parse \
        --path-format=absolute --git-dir --git-common-dir 2>/dev/null)
    [ -n "$_tgd" ] && [ "$_tgd" != "$_tgcd" ] && [ "$_tgd" != "$_gd" ] || continue
    _trepo=$repo
    if [ "$_tgcd" != "$_gcd" ]; then _trepo=$(basename "${_tgcd%/.git}"); fi
    _tbr=$(git -C "$_tree" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
    _pr_of "$_tree" "$_tbr" "$_trepo"
    _tname=$(basename "$_tree")
    _thead=$(_link "file://$_tree" "$_tname")
    _tx=""; if [ -n "$_tbr" ] && [ "$_tbr" != "worktree-$_tname" ]; then _tx=" $_ARW $_tbr"; fi
    _th+=("$_thead"); _tr+=("+${_trepo:+ $_trepo}"); _tx_+=("$_tx"); _tt+=("$(_pr_seg "$_tree")")
  done < "$_state/worktrees-$_sid"
fi

# The location is the repo; the worktree column is the tree's folder, or the branch in the main checkout, with the
# branch when it is not worktree-<tree>.
place_head=""; place_tree=""; place_extra=""; place_tail=""
if [ -n "$repo" ] || [ -n "$branch" ]; then
  place_head=${repo:-${branch:-main}}
  if [ -n "$repo" ]; then
    if [ -n "$wt" ]; then
      place_tree=$(_link "file://$cwd" "$wt")
      if [ -n "$branch" ] && [ "$branch" != "worktree-$wt" ]; then place_extra=" $_ARW $branch"; fi
    else
      place_tree=${branch:-main}
    fi
    _pr_of "$cwd" "$branch"
    place_tail=$(_pr_seg "$cwd")
  fi
fi

# Path — the FALLBACK identity, shown ONLY when there is no repo:branch to show.
#
# The cwd may be a folder that is no repo, holding several (~/work holding ~/work/app and ~/work/api): the git calls
# above fall back to "", and this segment is then the line's only identity, so it is drawn whenever there is no repo.
#
# DECISION: rendered as the last 2 segments so sibling repos under a shared parent stay
# distinguishable rather than collapsing to a bare basename.
if [ -z "$place_head" ] && [ -n "$cwd" ]; then
  place_head=$(printf '%s' "$cwd" | awk -F/ '{n=NF; if (n>=2) print $(n-1)"/"$n; else print $n}')
fi

# Session (5h) and weekly rate-limit remaining %, each with time to reset.
#
# CONTRACT: .rate_limits.{five_hour,seven_day} are each nullish — a session with no
# usage yet, or an auth mode with no window, omits them. An ABSENT window renders
# nothing at all; a window that is present but unreadable renders "?". Those are
# different facts and the line must not merge them.
#
# A value that is not a number from 0 to 100 is "?", checked before any arithmetic: an unreadable value read as
# 100% left is the number someone starts a long run on.
_pct_left() { # <used_percentage> -> "58" / "?" — caller has already checked presence
  local v="$1"
  case "$v" in
    ''|.|*[!0-9.]*|*.*.*) printf '?'; return 0 ;;
  esac
  # Out of range is a shape we do not understand, not a number to clamp and show.
  awk -v u="$v" 'BEGIN { if (u < 0 || u > 100) { printf "?" } else { printf "%.0f", 100 - u } }'
}

# resets_at arrives as an ISO 8601 timestamp or as epoch seconds, depending on the Claude Code build; both are read,
# and anything else is "?".
_secs_until() { # <resets_at> -> seconds until it / "?" / "" when absent or already past
  local raw="$1" ts head rest epoch now delta
  [ -n "$raw" ] && [ "$raw" != null ] || return 0   # absent — caller shows no clock
  case "$raw" in
    *[!0-9]*)
      ts="$raw"
      # The fraction of a second is dropped and the zone after it kept: "…T04:53:09.500+02:00" is "…T04:53:09+02:00".
      case "$ts" in
        *.*)
          head="${ts%%.*}"; rest="${ts#*.}"
          while :; do case "$rest" in [0-9]*) rest="${rest#?}" ;; *) break ;; esac; done
          ts="$head$rest"
          ;;
      esac
      # BSD strptime's %z reads `+0200` and not `+02:00`, so the colon goes.
      case "$ts" in
        *[+-][0-9][0-9]:[0-9][0-9]) ts="${ts%:*}${ts##*:}" ;;
      esac
      # `date -j -f` parses as local time and ignores a trailing Z, so -u makes a Z or a bare time UTC.
      if [ -n "$_gnu" ]; then
        # GNU date reads every one of these spellings itself; a bare one is UTC, as below.
        case "$ts" in *Z|*[+-][0-9][0-9][0-9][0-9]) ;; *) ts="${ts}Z" ;; esac
        epoch=$(date -u -d "$ts" +%s 2>/dev/null)
      else
        case "$ts" in
          *Z) epoch=$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$ts" +%s 2>/dev/null) ;;
          *[+-][0-9][0-9][0-9][0-9]) epoch=$(date -j -f '%Y-%m-%dT%H:%M:%S%z' "$ts" +%s 2>/dev/null) ;;
          *) epoch=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "$ts" +%s 2>/dev/null) ;;
        esac
      fi
      ;;
    # bash reads a zero-padded digit string as octal, so 10# forces base 10 and nothing reaches stderr.
    *) epoch=$(( 10#$raw )) ;;
  esac
  case "$epoch" in ''|*[!0-9]*) printf '?'; return 0 ;; esac
  now=${STATUSLINE_NOW:-$(date +%s)}
  delta=$(( epoch - now ))
  [ "$delta" -gt 0 ] || return 0                    # already reset — no clock to show
  # Neither window can be more than a week out, so a longer delta means the units are
  # not what we think. This is where a millisecond epoch lands: unbounded, it rendered
  # "20650626d5h" with the same confidence as a real value.
  [ "$delta" -gt 691200 ] && { printf '?'; return 0; }
  printf '%s' "$delta"
}

# The weekly window is measured in days; showing it as "163h" is technically true
# and useless, so the unit steps down as the window closes.
_dur() { # <seconds> -> "2d6h" / "3h20m" / "45m" / "<1m"
  local d h m
  d=$(( $1 / 86400 )); h=$(( ($1 % 86400) / 3600 )); m=$(( ($1 % 3600) / 60 ))
  if [ "$d" -gt 0 ]; then printf '%dd%dh' "$d" "$h"
  elif [ "$h" -gt 0 ]; then printf '%dh%02dm' "$h" "$m"
  elif [ "$m" -gt 0 ]; then printf '%dm' "$m"
  else printf '<1m'; fi                             # never "0m", which reads as "now"
}

_reset_in() { # <resets_at> -> "2d6h" / "3h20m" / "45m" / "<1m" / "?" / ""
  local secs
  secs=$(_secs_until "$1")
  case "$secs" in ''|'?') printf '%s' "$secs" ;; *) _dur "$secs" ;; esac
}

_tone() { # <percent left> -> yellow at 25 or under, red at 10 or under, else ""
  case "$1" in ''|*[!0-9]*) return 0 ;; esac
  if [ "$1" -le 10 ]; then printf '%s' "$RED"
  elif [ "$1" -le 25 ]; then printf '%s' "$YEL"; fi
}

# The 5-hour window's pace: "out in 1h20m" when, at the rate used so far, it runs out
# before it resets; "" otherwise, and for the first ten minutes, while the rate means little.
_pace() { # <percent left> <seconds to reset>
  local used=$(( 100 - $1 )) elapsed=$(( 18000 - $2 )) out
  [ "$elapsed" -ge 600 ] && [ "$used" -ge 1 ] || return 0
  out=$(( $1 * elapsed / used ))
  [ "$out" -lt "$2" ] || return 0
  printf ' %sout in %s%s' "$YEL" "$(_dur "$out")" "${YEL:+$RST}"
}

_window() { # <five_hour|seven_day> <label> [tone] -> "sess 58% left (2h53m)" / ""
  local used raw secs seg left tone="" u="_rl_$1_used" r="_rl_$1_resets"
  used=${!u}
  [ -n "$used" ] || return 0
  left=$(_pct_left "$used")
  [ -n "${3:-}" ] && tone=$(_tone "$left")
  seg="$2 ${tone}${left}% left${tone:+$RST}"
  raw=${!r}
  secs=$(_secs_until "$raw")
  case "$secs" in
    '') ;;
    '?') seg="$seg ${DIM}(?)${RST}" ;;
    *) seg="$seg ${DIM}($(_dur "$secs"))${RST}"
       [ "$1" = five_hour ] && [ "$left" != '?' ] && seg="$seg$(_pace "$left" "$secs")" ;;
  esac
  printf '%s' "$seg"
}

sess_seg=$(_window five_hour session tone)
wk_seg=$(_window seven_day week)

ctx_seg=""
ctx_r=$(printf '%.0f' "$ctx" 2>/dev/null)
if [ -n "$ctx" ] && [[ "$ctx_r" =~ ^[0-9]+$ ]]; then
  ctx_tone=$(_tone "$(( 100 - ctx_r ))")
  ctx_seg="ctx ${ctx_tone}${ctx_r}%${ctx_tone:+$RST}"
fi

# Blazing Trails' focus file for this session, in the state folder: its focus rows and the plan files the session touched.
_focus_file="${_state:+$_state/focus-${_sid}.json}"

# The plan files the session touched, as the focus file lists them, grouped by the place each sits in (this worktree,
# main, another worktree, another repo, or a store). More than one place is a plan split across places. A place is
# green when the session wrote to it, dim when it only read it, red when a file in it is gone or untouched for a day.
# One line per place, in the order the session first touched it: label, file count, problem (gone/stale/"-"), and 1
# when the session wrote there or "-". No field is empty, since `read` collapses a run of tabs and would shift the
# fields after an empty one.
_plan_places() { # <focus file>
  local mark p root now age problem
  now=$(date +%s)
  jq -r 'select(.v == 1) | (.places // [])[]
      | select((.path | type) == "string" and (.path | length) > 0 and (.label | type) == "string" and (.label | length) > 0 and (.mark == "w" or .mark == "r" or .mark == "b"))
      | [.mark, .path, .label] | map(gsub("[[:cntrl:]]"; " ")) | join("\t")' "$1" 2>/dev/null \
    | while IFS=$'\t' read -r mark p root; do
        # A folder a command listed is not a plan file.
        [ -d "$p" ] && continue
        problem=""
        if [ ! -e "$p" ]; then
          # A command naming a path that is not there is a search pattern, not a reference.
          [ "$mark" = b ] && continue
          problem=gone
        elif [ -f "$p" ] && [ "$mark" != w ]; then
          age=$(( now - $(_mtime "$p" || echo "$now") ))
          # A stale file a command only named marks its place stale only where the session wrote nothing.
          [ "$age" -gt 86400 ] && problem=$([ "$mark" = b ] && echo named-stale || echo stale)
        fi
        printf '%s\t%s\t%s\n' "$root" "$problem" "$([ "$mark" = w ] && echo 1)"
      done \
    | awk -F'\t' '!($1 in c) { order[++n] = $1 } { c[$1]++ } $2 == "gone" { bad[$1] = "gone" } $2 == "stale" && !($1 in bad) { bad[$1] = "stale" } $2 == "named-stale" { ns[$1] = 1 } $3 == 1 { w[$1] = 1 }
        END { for (i = 1; i <= n; i++) { r = order[i]; if (!(r in bad) && (r in ns) && !(r in w)) bad[r] = "stale"; printf "%s\t%d\t%s\t%s\n", r, c[r], (r in bad) ? bad[r] : "-", (r in w) ? 1 : "-" } }'
}

plans=""
if [ -n "$_sid" ] && [ -r "$_focus_file" ]; then
  _proots=$(_plan_places "$_focus_file")
  _pn=0; _pseg=""
  while IFS=$'\t' read -r _root _count _problem _wrote; do
    [ -n "$_root" ] || continue
    _pn=$(( _pn + 1 ))
    if [ "$_problem" != - ]; then _hue=$RED; [ -z "$RST" ] && _count="$_count $_problem"
    elif [ "$_wrote" = 1 ]; then _hue=$GRN
    else _hue=$DIM; fi
    _pseg="${_pseg:+$_pseg${DIM} ${_DOT} ${RST}}${_hue}${_root}${_hue:+$RST} ${_count}"
  done <<< "$_proots"
  if [ "$_pn" -gt 0 ]; then
    if [ "$_pn" -gt 1 ]; then _tally="${YEL}${_SPLIT} split across ${_pn} places${YEL:+$RST}"
    else _tally="${GRN}${_ONE}${GRN:+$RST} one place"; fi
    plans="${_PLANS} ${_pseg}   ${_tally}"
  fi
fi

# Blazing Trails' focus rows, drawn as its focus file gives them: each row a list of parts, each part its text, its
# ASCII text, one of the terminal's 16 colours by index, bold and dim. The file is <state>/focus-<session id>.json;
# a file that is missing, unreadable, of another version or with any malformed part draws nothing.
_PAINT='
def color_ok: . == null or (type == "string" and test("^ansi256\\(([0-9]|1[0-5])\\)$"));
def flag_ok: . == null or type == "boolean";
def part_ok: type == "object" and (.text | type) == "string" and (.ascii == null or (.ascii | type) == "string")
  and (.color | color_ok) and (.bold | flag_ok) and (.dim | flag_ok);
def sgr: [ (if .bold then "1" else empty end), (if .dim then "2" else empty end),
  (if .color then .color | ltrimstr("ansi256(") | rtrimstr(")") | tonumber | (if . < 8 then 30 + . else 82 + . end) | tostring else empty end) ]
  | join(";");
def paint: ((if $glyphs == "" then .ascii // .text else .text end) | gsub("[[:cntrl:]]"; "")) as $t
  | (if $color == "" then "" else sgr end) as $s
  | if $s == "" then $t else "\u001b[\($s)m\($t)\u001b[0m" end;
if .v == 1 and (.rows | type) == "array" and all(.rows[]; type == "array" and all(.[]; part_ok))
then .rows[] | map(paint) | join("") else empty end'
focus=""
if [ -n "$_sid" ] && [ -r "$_focus_file" ]; then
  focus=$(jq -r --arg glyphs "$_glyphs" --arg color "${RST:+1}" "$_PAINT" "$_focus_file" 2>/dev/null)
fi

rows=()
if [ -n "$focus" ]; then while IFS= read -r _frow; do rows+=("$_frow"); done <<< "$focus"; fi
[ -n "$plans" ] && rows+=("$plans")

# _clip <text> <limit> keeps the first <limit> visible characters of <text>, its colour and link
# sequences whole, in _CO; _CW is the visible width of all of it, _LNK whether a link is open at the cut.
_clip() {
  local s=$1 lim=$2 i=0 n=0 len=${#1} c rest seq
  _CO=""; _LNK=0
  while [ "$i" -lt "$len" ]; do
    c=${s:i:1}
    if [ "$c" = $'\033' ]; then
      rest=${s:i}
      case "$rest" in
        $'\033['*) seq=${rest%%m*}m ;;
        $'\033]'*) seq=${rest%%$'\033\\'*}$'\033\\' ;;
        *) seq=$c ;;
      esac
      i=$(( i + ${#seq} ))
      [ "$n" -lt "$lim" ] || continue
      _CO="$_CO$seq"
      case "$seq" in $'\033]8;;\033\\') _LNK=0 ;; $'\033]8;;'*) _LNK=1 ;; esac
    else
      i=$(( i + 1 ))
      [ "$n" -lt "$lim" ] && _CO="$_CO$c"
      n=$(( n + 1 ))
    fi
  done
  _CW=$n
}

# _fit <text> <width> sets _FO to <text>, ended with … when it is wider than <width>, and _FW to its width.
_fit() {
  local w=$2
  [ "$w" -ge 1 ] || w=1
  _clip "$1" 100000
  if [ "$_CW" -le "$w" ]; then _FO=$_CO; _FW=$_CW; return 0; fi
  _clip "$1" $(( w - 1 ))
  _FO="$_CO$_ELL"; [ -z "$RST" ] || _FO="$_FO$RST"
  [ "$_LNK" = 1 ] && [ -n "$RST" ] && _FO="$_FO"$'\033]8;;\033\\'
  _FW=$w
}

# _fit_pair <head> <tail> <width> [extra]: head, extra and tail end to end. When they are too wide the extra
# shortens first, to a bare … when little is left, then the head down to 22 columns, then the tail.
_fit_pair() {
  local hw tw xw tail=$2 xtra=${4:-} need room
  _clip "$2" 100000; tw=$_CW
  _clip "$1" 100000; hw=$_CW
  _clip "$xtra" 100000; xw=$_CW
  if [ $(( hw + xw + tw )) -gt "$3" ] && [ "$xw" -gt 0 ]; then
    room=$(( $3 - hw - tw ))
    if [ "$room" -ge 5 ]; then _fit "$xtra" "$room"; xtra=$_FO; xw=$_FW
    elif [ "$room" -ge 2 ]; then xtra=" $_ELL"; xw=2
    elif [ "$room" -ge 1 ]; then xtra=$_ELL; xw=1
    else xtra=""; xw=0; fi
  fi
  need=$hw; [ "$need" -gt 22 ] && need=22
  if [ $(( $3 - tw - xw )) -lt "$need" ]; then _fit "$tail" $(( $3 - need - xw )); tail=$_FO; tw=$_FW; fi
  _fit "$1" $(( $3 - tw - xw )); _FO="$_FO$xtra$tail"; _FW=$(( _FW + xw + tw ))
}

_spaces() { printf -v _SP '%*s' "$(( $1 > 0 ? $1 : 0 ))" ''; }
_rule() { _spaces "$1"; _RL=${_SP// /$_H}; }

# The panel titles; a rename is an edit here.
_TITLE_LOCATION=location; _TITLE_WORKTREE=worktree; _TITLE_MODEL=model; _TITLE_USAGE=usage

# The location and worktree panels' rows: the session's place, its name (absent until /rename names it), a blank row, then the other worktrees, two at most.
_lc=(); _wh=(); _wx=(); _wt=()
if [ -n "$place_head" ]; then _lc+=("$place_head"); _wh+=("$place_tree"); _wx+=("$place_extra"); _wt+=("$place_tail"); fi
if [ -n "$bot" ]; then _lc+=("bot: $bot"); _wh+=(""); _wx+=(""); _wt+=(""); fi
_shown=${#_th[@]}; [ "$_shown" -gt 2 ] && _shown=2
if [ "$_shown" -gt 0 ] && [ "${#_lc[@]}" -gt 0 ]; then _lc+=(""); _wh+=(""); _wx+=(""); _wt+=(""); fi
for ((_i = 0; _i < _shown; _i++)); do _lc+=("${_tr[$_i]}"); _wh+=("${_th[$_i]}"); _wx+=("${_tx_[$_i]}"); _wt+=("${_tt[$_i]}"); done
if [ "${#_th[@]}" -gt 2 ]; then _lc+=(""); _wh+=("${DIM}+$(( ${#_th[@]} - 2 )) more${DIM:+$RST}"); _wx+=(""); _wt+=(""); fi

# The model panel's lines: the display name, then the effort. CONTRACT: .effort is absent on models without the
# effort param, so the model renders alone.
_ml=()
[ -n "$model" ] && _ml+=("$model")
[ -n "$model" ] && [ -n "$effort" ] && _ml+=("$effort effort")

# The usage panel's lines: ctx, then each window.
_ul=()
for _item in "$ctx_seg" "$sess_seg" "$wk_seg"; do [ -n "$_item" ] && _ul+=("$_item"); done

_lmax=24; _wmax=40; _mmax=20; _boxmax=100

if [ "${#_lc[@]}" -gt 0 ] || [ "${#_ml[@]}" -gt 0 ] || [ "${#_ul[@]}" -gt 0 ]; then
  # Panel widths follow their content, the box stays within _boxmax. Each panel is at least as wide as its title and a rule.
  _np=2; [ "${#_ml[@]}" -gt 0 ] && _np=3
  _ovh=$(( 3 * _np + 1 ))
  _lw=$(( ${#_TITLE_LOCATION} + 2 )); _ww=$(( ${#_TITLE_WORKTREE} + 2 )); _mw=$(( ${#_TITLE_MODEL} + 2 ))
  for _x in "${_lc[@]+"${_lc[@]}"}"; do
    _fit "$_x" "$_lmax"; [ "$_FW" -gt "$_lw" ] && _lw=$_FW
  done
  for ((_i = 0; _i < ${#_wh[@]}; _i++)); do
    _fit_pair "${_wh[$_i]}" "${_wt[$_i]}" "$_wmax" "${_wx[$_i]}"; [ "$_FW" -gt "$_ww" ] && _ww=$_FW
  done
  for _x in "${_ml[@]+"${_ml[@]}"}"; do
    _fit "$_x" "$_mmax"; [ "$_FW" -gt "$_mw" ] && _mw=$_FW
  done
  [ "$_np" = 3 ] || _mw=0

  # The usage row: ctx and each window on one line, as wide as the box up to _boxmax; the last panel takes the difference.
  _usage_line() { _uline=""; for _x in "${_ul[@]+"${_ul[@]}"}"; do _uline+="${_uline:+  $_DOT  }$_x"; done; _clip "$_uline" 100000; _uneed=$_CW; }
  _usage_line
  if [ $(( _uneed + 4 )) -gt "$_boxmax" ]; then
    for _i in "${!_ul[@]}"; do
      _ul[$_i]=${_ul[$_i]/#session/sess}; _ul[$_i]=${_ul[$_i]/#week/wk}
    done
    _usage_line
  fi
  [ "$_uneed" -gt $(( _boxmax - 4 )) ] && _uneed=$(( _boxmax - 4 ))
  _gap=$(( _uneed - (_lw + _ww + _mw + _ovh - 4) ))
  if [ "$_gap" -gt 0 ]; then if [ "$_np" = 3 ]; then _mw=$(( _mw + _gap )); else _ww=$(( _ww + _gap )); fi; fi
  _bw=$(( _lw + _ww + _mw + _ovh ))
  _inner=$(( _bw - 4 ))
  _vb="${DIM}${_V}${DIM:+$RST}"

  # a panel's top edge: ┬ or ┌, its title, and the rule to the panel's end
  _rule $(( _lw + 2 - ${#_TITLE_LOCATION} - 3 )); _top="${_TL}${_H} ${_TITLE_LOCATION} $_RL"
  _rule $(( _ww + 2 - ${#_TITLE_WORKTREE} - 3 )); _top="$_top${_TJ}${_H} ${_TITLE_WORKTREE} $_RL"
  if [ "$_np" = 3 ]; then _rule $(( _mw + 2 - ${#_TITLE_MODEL} - 3 )); _top="$_top${_TJ}${_H} ${_TITLE_MODEL} $_RL"; fi
  rows+=("${DIM}${_top}${_TR}${DIM:+$RST}")

  _nl=${#_lc[@]}
  [ "${#_ml[@]}" -gt "$_nl" ] && _nl=${#_ml[@]}
  [ "$_nl" -gt 0 ] || _nl=1
  for ((_i = 0; _i < _nl; _i++)); do
    _mcell=""
    if [ "$_i" -lt "${#_lc[@]}" ]; then _fit "${_lc[$_i]}" "$_lw"; else _FO=""; _FW=0; fi
    _spaces $(( _lw - _FW )); _lcell="$_FO$_SP"
    if [ "$_i" -lt "${#_wh[@]}" ]; then _fit_pair "${_wh[$_i]}" "${_wt[$_i]}" "$_ww" "${_wx[$_i]}"; else _FO=""; _FW=0; fi
    _spaces $(( _ww - _FW )); _wcell="$_FO$_SP"
    if [ "$_np" = 3 ]; then
      if [ "$_i" -lt "${#_ml[@]}" ]; then _fit "${_ml[$_i]}" "$_mw"; else _FO=""; _FW=0; fi
      _spaces $(( _mw - _FW )); _mcell=" $_vb $_FO$_SP"
    fi
    rows+=("$_vb $_lcell $_vb $_wcell$_mcell $_vb")
  done

  # the panels' bottom edge, ├ … ┤ under a usage title when the usage row follows, else └ … ┘
  if [ "${#_ul[@]}" -gt 0 ]; then
    _rule $(( _lw + 2 - ${#_TITLE_USAGE} - 3 )); _div="${_LJ}${_H} ${_TITLE_USAGE} $_RL${_BJ}"; _end=$_RJ
  else
    _rule $(( _lw + 2 )); _div="${_BL}$_RL${_BJ}"; _end=$_BR
  fi
  _rule $(( _ww + 2 )); _div="$_div$_RL"
  if [ "$_np" = 3 ]; then _rule $(( _mw + 2 )); _div="$_div${_BJ}$_RL"; fi
  rows+=("${DIM}${_div}${_end}${DIM:+$RST}")
  if [ "${#_ul[@]}" -gt 0 ]; then
    _fit "$_uline" "$_inner"; _spaces $(( _inner - _FW ))
    rows+=("$_vb $_FO$_SP $_vb")
    _rule $(( _bw - 2 )); rows+=("${DIM}${_BL}${_RL}${_BR}${DIM:+$RST}")
  fi
fi
( IFS=$'\n'; printf '%s' "${rows[*]}" )
