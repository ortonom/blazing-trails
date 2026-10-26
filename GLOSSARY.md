# Glossary

The repo's own terms, one line each.

- **focus signal**: a session's health score, focus level and plan name, which `hooks/focus-state.ts` keeps and publishes.
- **focus level**: one of `clear`, `goals`, `fragmented`, `regroup` and `pause`, read from the plans in play and the last 3 judged turns (`levelOf`); each level's points, cap, colour and words are one row of `LEVELS` (`hooks/level.ts`).
- **health score**: a whole number from 0 to 10, from focus, verification and course control over the last 5 turns (`hooks/scorecard.ts`); HP on the status line.
- **focus file**: `focus-<session id>.json`, the focus signal with the rows a status line draws and the plan places (`hooks/focus-file.ts`); the one thing the status line reads of the plugin.
- **plan source**: what a plan read is offered: plan mode's plan, a Markdown file outside a temp folder with boxes or under `plans/`, `specs/` or `tasks/`, `gh issue view`, or a skill; not a plan place.
- **plan place**: where a plan file the session touched sits, a store or a kind of folder in a checkout, drawn on the ☰ row (`hooks/places.ts`); not a plan source.
- **plan read**: one model read of a text as a plan, its goal, done, done boxes and paths; `hooks/plan-read.ts` also reads what a call offers as a plan source, caches and retries the reads, and lands them in order; `hooks/tool-call.ts` names which calls offer one.
- **turn judge**: one model read of whether a turn served the goal, and of the person's corrections and repeats (`hooks/turn-judge.ts`).
- **session memory**: what a session keeps beside its state, its reads in flight, messages and turn calls, held by session id (`hooks/session-memory.ts`); `/clear` replaces it, and a session switch replaces all of it but the turn in flight.
