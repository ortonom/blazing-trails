# blazing-trails

The marketplace for `ortonom`, a Claude Code plugin of skills, commands, an output style and the
Blazing Trails sidebar.

## Install

The plugin is in alpha: releases run `1.0.0-alpha.N`, then `1.0.0-beta.N`, then `1.0.0`, and anything may change
before `1.0.0`.

It needs Claude Code 2.1.311 or newer. Every change is tested against the newest Claude Code release, and the hooks
API the sidebar and status line build on is early access, so an older Claude Code can skip their hooks.

```
/plugin marketplace add ortonom/blazing-trails
/plugin install ortonom@blazing-trails
```

Updates come when you ask for them, with `claude plugin update ortonom@blazing-trails`, or by themselves once you turn
on auto-update: `/plugin` → Marketplaces → blazing-trails → Enable auto-update. On a machine with no GitHub SSH key,
set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`, or updates fail.

## What's inside

```
ortonom
├─ skills/            what Claude can do; each is also /<name>
│  ├─ session/        cold-read · fingerprint
│  ├─ repo/           descatter
│  └─ silent-failure/ silent-failure
├─ commands/          dif · clarify · sitrep · regroup · native-qa · statusline
├─ agents/            second-opinion
├─ output-styles/     structured
└─ hooks/             the Blazing Trails sidebar, /sidebar, and the focus signal
```

### Skills

| group | skill | what it does | reach for it when |
|---|---|---|---|
| session | `cold-read` | a reader who has not seen the work proofreads, edits, reviews or checks a draft | a draft is about to go out |
| session | `fingerprint` | names the established concept behind an idea you can describe but not name | you are about to coin a term |
| repo | `descatter` | gathers an idea stated in several files into one place | one rule lives in several places |
| silent-failure | `silent-failure` | hunts controls that fail without telling anyone | something is slow or blocked and nothing says why |

### Commands

| command | what it does |
|---|---|
| `/dif` | shows a change as a diff and nothing else: the structured style's diff rule as a command |
| `/clarify` | restates what this session is trying to achieve, where the work stands and what is in the way; asks only where the answer changes the work |
| `/sitrep` | reports each ask in this conversation as delivered, not delivered or dropped, and the step already decided |
| `/regroup` | finds the plans, handoffs and branches about this work and names the one thing ready to ship; its tools only read |
| `/native-qa` | puts the open decisions in a conversation or plan to you as native Q&A dialogs, and ends on the decided task list |

Each command and skill answers to its bare name; where another command already has that name, type it as
`/ortonom:<name>`, as `/ortonom:statusline` is.

### Agents

| agent | started by | what it does |
|---|---|---|
| `second-opinion` | `cold-read` | reads the draft and its brief in one folder, and nothing else |

### Output style: `structured`

Structured writing: replies lead with the answer in plain words, with a diff for a change, a table
for a comparison, a numbered list for steps and prose for the rest. Choose it with `/output-style`.

### The status line

```
HP ■■■■■■■■■■■■■■□□□□□□ 7 · ⬆ CLEAR GOAL
☰ plan 2   ✓ one place
┌─ location ─────┬─ worktree ─┬─ model ─────┐
│ my-app         │ main       │ Opus 5.5    │
│                │            │ high effort │
├─ usage ────────┴────────────┴─────────────┤
│ ctx 48%  ·  session 99% left (4h48m)  ·  week 24% left (1d10h) │
└───────────────────────────────────────────┘
```

The HP row, the plan files this session touched, then the repo, worktrees and their PRs, the model and effort, and
context and plan usage. The agent panel shows each running agent's folder, model and state.

- Turn it on: `/ortonom:statusline`, once per machine. It points your `statusLine` setting at the copy the plugin
  keeps current in its data folder, so each update reaches it at the next session start. Nothing else touches the
  setting.
- The agent panel needs nothing: the plugin's settings set it, and your own `subagentStatusLine` wins over it.
- Needs `jq` and `git`; `gh` adds PR numbers and checks. Runs on macOS and Linux.
- `☰` lists the plan files this session read or wrote by where they sit (this worktree, main, another worktree or
  repo, `~/.claude/plans`, or a handoff's store), each with its count: green where the session wrote, dim where it only
  read, red where a file is gone or untouched for a day; then `✓ one place` while they sit together, or
  `▲ split across N places`. It is absent until the session touches one, and is drawn as
  `☰ worktree docs/plans/ 1   ✓ one place`.
- On the HP row, `!` and `!!` after the number mark health at 4 to 6 and at 1 to 3, and a `?` after the level
  means the last turn could not be read.
- It keeps its state, the focus file, the PR cache, the running agents and the session's worktrees, in
  `~/.claude/state`, the plugin's own folder; files there older than 14 days are deleted at session start.

| variable | what it does |
|---|---|
| `STATUSLINE_STATE` | the state folder, in place of `$CLAUDE_CONFIG_DIR/state` or `~/.claude/state` |
| `STATUSLINE_PR_TTL_MIN` | minutes a PR number is cached before `gh` is asked again; 5 |
| `STATUSLINE_LOCALES` | the UTF-8 locales tried when the terminal's has none; `en_US.UTF-8 C.UTF-8` |
| `NO_COLOR` | draws it plain |
| `STATUSLINE_NOW`, `STATUSLINE_PR_GH` | the clock and the `gh` the tests stand in |

### The Blazing Trails sidebar

`/sidebar` opens the plugin's sidebar, in three tabs (keys 1 to 3 while it has focus):

| tab | what it shows |
|---|---|
| Health | this session's HP row, then the one thing the session needs from you and what to do, or `✓ all good` |
| Commands | each skill and command with what it does; under cold-read its four asks and its reader, `second-opinion`; under fingerprint, silent-failure and descatter what this session found of the tool each uses when installed |
| About | how to open it, the version, the output style, where this README explains the score, the tools used when installed and whether this session has them, what the plugin writes and spends, and how to update or remove it |

The sidebar is drawn in the terminal's own 16 colours, the status line's, so it follows your colour scheme; its dim text
takes Claude Code's theme.

The plugin also writes one focus signal per session to `~/.claude/state/focus-<session id>.json`
(`$STATUSLINE_STATE` or `$CLAUDE_CONFIG_DIR/state` in place of `~/.claude/state` when set): the
signal, the rows a status line draws as they are, each a list of parts with its text, its
ASCII text and one of the terminal's 16 colours, and `places`: each plan file the session
touched, the place it sits in and whether it was written, read or named. `v` moves when the
shape does.

```
{"v": 1, "health": 9, "level": "clear", "plan": "bearings.md", "rows": [[{"text": "HP", "color": "ansi256(3)", "bold": true}, …]]}
```

```
HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬆ CLEAR GOAL
```

`health` is a whole number from 0 to 10, scored on the last 5 turns so each sign fades:

| part | points | scores |
|---|---|---|
| focus | 4 | the level: `clear` 4, `goals` 3, `fragmented` 2, `regroup` 1, `pause` 0 |
| verification | 3 | the latest check passed, or none is owed, 3; edits not yet checked 1; a failed check 0, and a "done" with no check 0 until a check passes or you confirm it |
| course control | 3 | less 1 for each correction or repeat and 0.2 for each nudge or interrupt; a change of goal costs nothing, and a fix you accept clears the corrections before it |

The total is held to 5 at `regroup`, to 3 at `pause`, and to 4 when course control reaches 0.

`level` is one of five:

| level | drawn as | the session |
|---|---|---|
| `clear` | ⬆ CLEAR GOAL | works from one plan whose done is written as checkboxes, its last 3 turns on it |
| `goals` | ⬈ GOALS | works from a spec stated in conversation, or from a plan not yet 3 turns on track |
| `fragmented` | ⇄ FRAGMENTED | has more than one plan in play, or its latest turn only partly on track |
| `regroup` | ↺ REGROUP | drifted from the goal on its latest turn: worth checking the goal is still the right one |
| `pause` | ‖ PAUSE | has been off track 3 turns, or has no objective to name |

A plan is the one you approve when leaving plan mode, a markdown file outside a temp folder with checkboxes or under `plans/`, `specs/` or `tasks/`, a folder of task files read as one plan, the output of `gh issue view`, or a skill that says what done looks like.

`plan` is the short name of the plan in force, or `""`.

A small model reads each plan once, and judges each turn against the plan, or against your first
message while there is no plan; checks, "done" claims, confirms and interrupts are read from the
turn itself. `STATUSLINE_STATE` names another folder for the file; otherwise `CLAUDE_CONFIG_DIR`
stands in for `~/.claude`.

## What it runs

- **Model calls**: Haiku, through your Claude Code session and on its usage. It reads each plan's text once, and
  judges each turn from the goal, your recent messages, shortened, and Claude's answer.
- **Commands**: `git rev-parse` in the session's folder. The status line runs `git`, and `gh pr list` for the
  branch's PR in a background process whose answer it keeps for 5 minutes. Each session start copies the two
  status-line scripts into the plugin's data folder.
- **Files**: `focus-<session>.json`, `worktrees-<session>`, `agents-<session>` and `pr-*` in `~/.claude/state`, or the
  folder `STATUSLINE_STATE` names. Each session start deletes the ones older than 14 days.
- **Network**: only the model calls above, through Claude Code, and `gh`, to GitHub. The plugin hooks no telemetry
  and sends no analytics.

## Licence

MIT, in `LICENSE`.
