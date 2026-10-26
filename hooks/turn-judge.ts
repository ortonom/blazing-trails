import type { EngineInterface } from 'claude-code'

import type { Edits, Goal, Judge, Row, State } from '../types'
import { ask, jsonIn } from './model'
import { FOCUS_READ_PROMPT } from './prompts'
import type { Call } from './scorecard'
import { goalOf } from './state'

// A turn to judge: the goal it is judged against, the edits it scores, the person's messages, its answer (null for a
// turn not read) and its calls.
export type Judged = { goal: Goal | null; edits: Edits; earlier: string[]; prior: string; said: string; answer: string | null; made: Call[]; isAborted: boolean }

type Ended = { said: string; prior: string; earlier: string[]; made: Call[]; ranSkill: string }

// What a finished turn is judged against: the goal in force as the turn was sealed. A skill turn under another plan is
// the person's own redirect: its edits belong to the skill's plan, so it scores none, and it is not read; nor is a
// turn that ended without an answer.
export function judgedOf(sealed: State, ended: Ended, end: { isAnswer: boolean; answer: string; isAborted: boolean }): Judged {
  const isRedirect = !!sealed.goal && !!ended.ranSkill && sealed.goal.spec !== ended.ranSkill

  return {
    goal: goalOf(sealed),
    edits: isRedirect ? { inside: 0, outside: 0 } : sealed.edits,
    earlier: ended.earlier,
    prior: ended.prior,
    said: ended.said,
    answer: end.isAnswer && !isRedirect ? end.answer : null,
    made: ended.made,
    isAborted: end.isAborted,
  }
}

// The facts only a reader can mark, as the focus read answers them.
export type Marks = Pick<Row, 'userCorrection' | 'userNudge' | 'userGoalChange' | 'userRepeat' | 'isResolved'>

// What the focus read is shown of a turn: the goal, the person's messages so far, and the answer.
type ReadContext = { goal: string; done: string; earlier: string[]; prior: string; latest: string; answer: string }

// How long the focus read may take; a read that runs past it is a failed read, so the turns after it are still judged.
const READ_MS = 30_000

// One read of whether a turn served the goal, and of the person's corrections and repeats; with no goal it only marks the
// person's message, and any failure, a reply without the correction and repeat marks among them, is unknown and unmarked.
export async function judgeTurn($: EngineInterface, c: ReadContext, hasGoal: boolean): Promise<{ verdict: Judge; marks: Marks | null }> {
  const reply = await ask($, FOCUS_READ_PROMPT, readPrompt(c), 120, READ_MS)
  if ('reason' in reply) return { verdict: 'unknown', marks: null }
  const json = jsonIn(reply.text)
  const marks = parseMarks(json)

  return { verdict: hasGoal && marks ? judgeOf(json) : 'unknown', marks }
}

// The turn judge's verdict, from JSON the model wrote; anything else is unknown.
export function judgeOf(json: Record<string, unknown> | null): Judge {
  const focus = json?.focus

  return focus === 'on' || focus === 'partly' || focus === 'off' ? focus : 'unknown'
}

const flag = (x: unknown) => x === true

// The reader's marks from the focus read's JSON: correction and repeat are required, the softer marks default to unmarked.
export function parseMarks(json: Record<string, unknown> | null): Marks | null {
  if (typeof json?.userCorrection !== 'boolean' || typeof json.userRepeat !== 'boolean') return null
  const isGoalChange = flag(json.userGoalChange)

  return {
    userCorrection: json.userCorrection && !isGoalChange,
    userNudge: flag(json.userNudge) && !json.userCorrection && !isGoalChange,
    userGoalChange: isGoalChange,
    userRepeat: json.userRepeat,
    isResolved: flag(json.isResolved),
  }
}

// How many of the person's messages before the previous one the read sees, and how much of each.
export const EARLIER = 8
const EARLIER_QUOTE = 400
const QUOTE = 4_000

const quoted = (text: string, most = QUOTE) => (text.length > most ? `${text.slice(0, most)}…` : text)

export function readPrompt(c: ReadContext) {
  const earlier = c.earlier.slice(-EARLIER).map(m => `- ${quoted(m.replace(/\s+/g, ' '), EARLIER_QUOTE)}`)

  return [
    `Goal: ${c.goal || '(none stated)'}\nDone when: ${c.done || '(not stated)'}`,
    `Earlier messages, oldest first:\n${earlier.join('\n') || '(none)'}`,
    `Previous message:\n${quoted(c.prior)}`,
    `Latest message:\n${quoted(c.latest)}`,
    `Answer:\n${quoted(c.answer)}`,
  ].join('\n\n')
}
