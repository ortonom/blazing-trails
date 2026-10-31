#!/usr/bin/env bash
# Blazing Trails' agent panel: one row per sub-agent, wired by the plugin's own settings.json as its
# subagentStatusLine. Reads {session_id, columns, cwd, tasks[]}
# and writes one {"id", "content"} line per task:
#   reviewer  working  Sonnet  low  checking the diff     @fix-login  1m40s
# The name is in the agent's own colour; its state is working, stalled (running with no new
# tokens for six readings), done, failed or stopped, and a finished row is dim. Columns line up
# across rows; on a narrow panel the time, model, effort and place go first, then the task
# text shortens.

input=$(cat)
out=$(printf '%s' "$input" | jq -r --argjson clock "${STATUSLINE_NOW:-null}" --argjson nc "$([ -n "${NO_COLOR:-}" ] && echo true || echo false)" '
  def paint($c): if $nc or $c == "" then . else "\u001b[\($c)m\(.)\u001b[0m" end;
  def pad($n): if $n > length then . + ([range($n - length)] | map(" ") | join("")) else . end;
  def cut($n): if length > $n then .[0:([$n - 1, 0] | max)] + "…" else . end;
  def two: tostring | if length < 2 then "0" + . else . end;
  def dur: floor as $s
    | if $s >= 86400 then "\($s / 86400 | floor)d\($s % 86400 / 3600 | floor)h"
      elif $s >= 3600 then "\($s / 3600 | floor)h\($s % 3600 / 60 | floor | two)m"
      elif $s >= 60 then "\($s / 60 | floor)m\($s % 60 | two)s"
      else "\($s)s" end;
  def widest(f): (map(f | length) | max) // 0;

  (.cwd // "") as $cwd
  | ((.columns // 100) | if type == "number" then . else 100 end) as $cols
  | [(.tasks // [])[] | . as $t
      | ($t.tokenSamples // []) as $s
      | (($t.name // $t.agentType // "agent") | tostring) as $name
      | ($t.status == "running" or $t.status == "pending") as $live
      | ($t.status == "running" and ($s | length) >= 6 and ($s[-6:] | unique | length) == 1) as $stalled
      | (["36", "35", "34", "32", "96", "95", "94", "92"][($name | explode | add) % 8]) as $hue
      | {
          id: $t.id,
          live: $live,
          stalled: $stalled,
          hue: $hue,
          state: (if $stalled then ["stalled", "33"] elif $live then ["working", ""]
                  elif $t.status == "completed" then ["done", ""]
                  elif $t.status == "failed" then ["failed", "31"]
                  else ["stopped", ""] end),
          name: $name,
          model: (($t.model // "") | ascii_downcase
                  | if test("opus") then "Opus" elif test("sonnet") then "Sonnet"
                    elif test("haiku") then "Haiku" elif test("fable") then "Fable" else "" end),
          effort: (($t.effort // "") | tostring),
          label: (($t.label // $t.description // "") | tostring | gsub("\\s+"; " ")),
          place: (if ($t.cwd // "") != "" and $t.cwd != $cwd then "@" + ($t.cwd | split("/") | last) else "" end),
          time: (if $live and $t.startTime then (($clock // now) - $t.startTime / 1000 | [., 0] | max | dur) else "" end)
        }
    ] as $rows
  | ($rows | widest(.name)) as $wn
  | ($rows | widest(.model)) as $wm
  | ($rows | widest(.effort)) as $we
  | ($rows | widest(.place)) as $wp
  | ($rows | widest(.time)) as $wt
  | ($rows | widest(.state[0])) as $ws
  # Each optional column, in the order it gives way, with its width.
  | [["time", $wt], ["model", $wm], ["effort", $we], ["place", $wp]] as $optional
  | ($rows | widest(.label) | [., 30] | min | [., 8] | max) as $want
  | (reduce $optional[] as $o ({keep: ($optional | map(.[0])), width: ($wn + 2 + $ws + ($optional | map(if .[1] > 0 then .[1] + 2 else 0 end) | add))};
      if $cols - .width >= $want + 2 then . else {keep: (.keep - [$o[0]]), width: (.width - (if $o[1] > 0 then $o[1] + 2 else 0 end))} end)) as $fit
  | ([$cols - $fit.width - 2, 4] | max) as $wl
  | ($rows[] | . as $r
      # A finished row is dim throughout, but for the word failed.
      | def hue($c): if $r.live then paint($c) else paint("2") end;
      [
        ($r.name | pad($wn) | hue($r.hue)),
        ($r.state[0] | pad($ws) | if $r.state[0] == "failed" then paint("31") else hue($r.state[1]) end),
        (if ($fit.keep | index("model")) and $wm > 0 then ($r.model | pad($wm) | hue("")) else empty end),
        (if ($fit.keep | index("effort")) and $we > 0 then ($r.effort | pad($we) | hue("")) else empty end),
        ($r.label | cut($wl) | if ($fit.keep | index("place")) and $wp > 0 or ($fit.keep | index("time")) and $wt > 0 then pad($wl) else . end | hue("")),
        (if ($fit.keep | index("place")) and $wp > 0 then ($r.place | pad($wp) | hue("")) else empty end),
        (if ($fit.keep | index("time")) and $wt > 0 then ($r.time | hue("")) else empty end)
      ]
      | {id: $r.id, content: join("  ")}
      | tojson)
')

[ -n "$out" ] && printf '%s\n' "$out"
exit 0
