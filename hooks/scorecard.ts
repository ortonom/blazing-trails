import type { Level, Row } from '../types'
import { LEVELS } from './level'
import { EDITORS } from './tool-call'
import type { Marks } from './turn-judge'

// The health score out of 10: focus 4 from the level, verification 3 and course control 3 from the last 5 turns' rows,
// so every sign fades after 5 turns.

export type { Row }
export type Score = { total: number; focus: number; verification: number; course: number }

export const WINDOW = 5
// The most each part scores: focus at clear, verification with nothing owed, course control with no sign.
export const MOST = { focus: LEVELS.clear.points, verification: 3, course: 3 }
// Verification while edits wait for a check.
export const OWED = 1
// The most health once course control reaches 0.
export const SPENT_CAP = 4
// What each sign costs course control: a soft sign a fifth of an outright one; a change of goal costs nothing.
export const COST = { correction: 1, repeat: 1, nudge: 0.2, interrupt: 0.2 }

// A test runner, typecheck, linter, repo check, CI query, live probe or playwright, known by its script name where it
// leads a command: at the start or after a separator, behind any variables set, runners such as npx, or a path to it.
// A curl is a probe only when it fails on an HTTP error (-f, --fail) or asks for the headers alone (-I, --head).
const CHECK =
  /(?:^|[\n;&|(])\s*(?:\w+=\S*\s+)*(?:(?:npx|bunx|time|timeout \S+|uv run|poetry run|python3? -m|bash|sh)\s+)*(?:[\w.~-]*\/)*((npm|pnpm|yarn|bun) (run )?(test|check)([:-][\w:-]+)?(?![\w])|pytest|vitest|jest|tsc|eslint|ruff|cargo test|go test|make (test|check)|claude plugin test|bin\/check[\w-]*|gh pr checks|gh run (view|watch)|curl(?=[^\n;&|]*\s(?:--fail\b|--head\b|-[a-zA-Z]*[fI][a-zA-Z]*(?!\S)))|playwright)\b/
const FAILED = /\b([1-9]\d* (fail|failed|failing|errors?)\b|FAIL\b|(?<!\b0 )failed\b(?!"?:\s*0\b)|error TS\d+)|HTTP\/[\d.]+ [45]\d\d/
// A claim the work is done; "done" naming what done means, as a plan or a readback writes it, is no claim.
const DONE = /\b(done(?!\s+(means|looks|when|is when|criteria)\b)|complete|completed|fixed|merged|shipped|works now|is live|all set)\b/i
const CONFIRM = /^(yes|yep|yup|perfect|great|excellent|that works|that's (great|perfect|excellent)|looks good|lgtm|thanks|thank you)\b/i
const INTERRUPTED = /^\[Request interrupted by user/

// One tool call of a turn: its tool, its Bash command if any, its result's text, and whether it errored or was refused.
export type Call = { tool: string; command: string; result: string; isError: boolean; isRefused: boolean }

const isCheck = (c: Call) => c.tool === 'Bash' && !c.isRefused && CHECK.test(c.command)

// A turn's scripted facts from the person's message, the agent's last words and the calls it made; the focus read marks the rest.
export function scripted(user: string, last: string, calls: Call[]): Omit<Row, keyof Marks> {
  const checks = calls.filter(isCheck)
  const failed = checks.some(c => c.isError || FAILED.test(c.result))

  return {
    toolErrors: calls.filter(c => c.isError).length,
    edited: calls.some(c => EDITORS.includes(c.tool) && !c.isError),
    checkRan: checks.length > 0,
    checkFailed: failed,
    checkPassed: checks.length > 0 && !failed,
    doneUnchecked: DONE.test(last) && checks.length === 0,
    userInterrupted: INTERRUPTED.test(user),
    userConfirm: CONFIRM.test(user),
  }
}

// Facts that hold nothing: no tool error, edit, check, claim of done, interrupt or confirmation.
export const isBlank = (r: Omit<Row, keyof Marks>) =>
  r.toolErrors === 0 && !r.edited && !r.checkRan && !r.doneUnchecked && !r.userInterrupted && !r.userConfirm

// A "done" with no check is checked by a later passing check, or by the person confirming it on the next turn.
const checkedBy = (rows: Row[], done: number) => rows.slice(done + 1).some((r, k) => r.checkPassed || (k === 0 && r.userConfirm))

const signCost = (r: Row) =>
  (r.userCorrection ? COST.correction : 0) + (r.userRepeat ? COST.repeat : 0) + (r.userNudge ? COST.nudge : 0) + (r.userInterrupted ? COST.interrupt : 0)

// Where verification stands over the last 5 rows: the latest check failed, a "done" is still unchecked, edits wait
// for a check, or nothing is owed.
export type Proof = 'failed' | 'unchecked' | 'owed' | 'checked'

export function proofOf(all: readonly Row[]): Proof {
  const rows = all.slice(-WINDOW)
  const confirmedDone = (j: number) => j > 0 && rows[j]!.userConfirm && rows[j - 1]!.doneUnchecked
  const lastEvidence = rows.findLastIndex((r, j) => r.checkRan || confirmedDone(j))
  const unchecked = rows.findLastIndex(r => r.doneUnchecked)
  if (lastEvidence >= 0 && rows[lastEvidence]!.checkFailed) return 'failed'
  if (unchecked >= 0 && !checkedBy(rows, unchecked)) return 'unchecked'
  // Edits since the last check, or since the window opened when none ran, are owed one.
  return rows.slice(lastEvidence + 1).some(r => r.edited) ? 'owed' : 'checked'
}

// The rows course control counts: the last 5, from the latest that resolves the person's earlier corrections on.
const uncleared = (all: readonly Row[]) => {
  const rows = all.slice(-WINDOW)
  return rows.slice(rows.findLastIndex(r => r.isResolved) + 1)
}

// What the person's signs still cost course control.
export const costOf = (all: readonly Row[]) => uncleared(all).reduce((n, r) => n + signCost(r), 0)

// The person's corrections and repeats that still count against course control.
export const correctionsOf = (all: readonly Row[]) => uncleared(all).reduce((n, r) => n + Number(r.userCorrection) + Number(r.userRepeat), 0)

// The score on the last 5 of the rows at the session's level.
export function score(all: readonly Row[], level: Level): Score {
  const proof = proofOf(all)
  const verification = proof === 'failed' || proof === 'unchecked' ? 0 : proof === 'owed' ? OWED : MOST.verification

  const cost = costOf(all)
  const course = Math.max(0, Math.round((MOST.course - cost) * 10) / 10)

  const focus = LEVELS[level].points
  const sum = Math.round(focus + verification + course)
  const total = Math.min(sum, LEVELS[level].cap, course === 0 ? SPENT_CAP : LEVELS.clear.cap)

  return { total, focus, verification, course }
}
