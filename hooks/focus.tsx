import type { EngineInterface, On } from 'claude-code'

import type { Event, Judge, Reading } from '../types'
import { failed } from './failed'
import { apply, clear, home, landIfLive, memory, open, plansDir, plansOf, prune, seal } from './focus-state'
import { scripted, type Call, type Row } from './scorecard'
import { offered, portOf } from './plan-read'
import { touchesOf } from './places'
import { asked, called, endTurn, heard, inTurnOrder, skillStarted, type Memory } from './session-memory'
import { resolve } from './state'
import { callOf, recordOf } from './tool-call'
import { judgedOf, judgeTurn, type Judged, type Marks } from './turn-judge'

// A message of this many words or more can be the session's goal while there is no plan.
const ASK_WORDS = 3

let isInteractive = true

// A turn's row: its scripted facts, with the reader's marks where the read gave them.
const unmarked: Marks = { userCorrection: false, userNudge: false, userGoalChange: false, userRepeat: false, isResolved: false }
const rowOf = (said: string, answer: string, made: Call[], marks: Marks | null): Row => ({ ...scripted(said, answer, made), ...(marks ?? unmarked) })

// The row an interrupt adds after the turn it cut short, as the session log shows it.
const INTERRUPT = rowOf('[Request interrupted by user]', '', [], null)

// A turn that ended without an answer is not read, so it is unknown and counts only its edits and scripted facts.
async function judge($: EngineInterface, s: Memory, t: Judged) {
  const { verdict, marks } =
    t.answer === null
      ? { verdict: 'unknown' as Judge, marks: null }
      : await judgeTurn($, { goal: t.goal?.thread ?? '', done: t.goal?.done ?? '', earlier: t.earlier, prior: t.prior, latest: t.said, answer: t.answer }, !!t.goal)
  const reading: Reading = marks ? 'read' : t.answer === null ? 'none' : 'failed'
  const rows = [rowOf(t.said, t.answer ?? '', t.made, marks), ...(t.isAborted ? [INTERRUPT] : [])]
  await landIfLive($, s, () => ({ type: 'turn', goal: t.goal, edits: t.edits, judge: verdict, rows, reading }))
}

// Called from the plugin's own session.start: load this session; prune old sessions after.
export async function focusStart($: EngineInterface, isPersonHere = true) {
  isInteractive = isPersonHere
  await open($)
  $.clock.after(0, () => prune($).catch(err => failed($, 'pruning old sessions', err)))
}

export function registerFocus(on: On) {
  on('tool.call', async ($, e, next) => {
    const isMain = !(e as { agentId?: string }).agentId
    if (!isMain) return next(e)
    const input = e as unknown as Record<string, unknown>
    if (String(e.tool) === 'Skill' && typeof input.skill === 'string') asked(await memory($), input.skill)
    const ran = await next(e)
    const m = await memory($)
    const record = recordOf(String(e.tool), input, ran)
    called(m, record)
    if (record.isError) return ran
    const call = callOf(String(e.tool), input)
    const cwd = call.needsCwd ? await $.session.cwd() : ''
    const touches: Event[] = touchesOf(call, cwd, home(), plansDir()).map(t => ({ type: 'touch', ...t }))
    const edit: Event[] = call.edited !== null ? [{ type: 'edit', path: resolve(call.edited, cwd, home()) }] : []
    // The touches and the edit are one change, saved and published once.
    if (touches.length || edit.length) await apply($, [...touches, ...edit])
    const found = call.offers && (await offered(portOf($), call.offers, ran.result, cwd, home()))
    if (found) await plansOf($, m).offer(found)

    return ran
  }).catch(($, e, next) => (failed($, 'tool.call hook', next.error), next(e)))

  on('prompt.submit', async ($, e, next) => {
    const m = await memory($)
    // A prompt the person never saw (a task notification) is no message of theirs.
    if (e.command && !e.turnId) asked(m, e.command.name)
    if (!e.isMeta) {
      heard(m, e.command ? `/${e.command.name} ${e.command.args}`.trim() : e.text, !!e.turnId)
      if (!e.command && e.text.trim().split(/\s+/).length >= ASK_WORDS) await apply($, [{ type: 'ask', text: e.text }])
    }

    return next(e)
  }).catch(($, e, next) => (failed($, 'prompt.submit hook', next.error), next(e)))

  // A skill the main session started is a plan candidate like a plan file: one that says what done looks like becomes the plan.
  on('skill.prompt', async ($, e, next) => {
    const s = await memory($)
    const source = skillStarted(s, e.skill)
    if (source !== null) await plansOf($, s).offer({ source, text: e.text, cwd: await $.session.cwd(), home: home() })

    return next(e)
  }).catch(($, e, next) => (failed($, 'skill.prompt hook', next.error), next(e)))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const sealed = await seal($)
      const s = await memory($)
      const ended = endTurn(s)
      // In a headless run nobody reads the signal, so no turn is judged.
      if (isInteractive) {
        const t = judgedOf(sealed, ended, { isAnswer: e.reason === 'answer', answer: e.answer ?? '', isAborted: !!e.isAborted })
        $.clock.after(0, () => inTurnOrder(s, () => judge($, s, t)))
      }
      plansOf($, s).retry()
    }

    return next(e)
  }).catch(($, e, next) => (failed($, 'turn.complete hook', next.error), next(e)))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await clear($)

    return next(e)
  }).catch(($, e, next) => (failed($, 'session.end hook', next.error), next(e)))
}
