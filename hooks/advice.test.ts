import { expect, test } from 'claude-code/testing'

import type { Row, State } from '../types'
import { adviceOf } from './advice'
import { initial } from './state'

const quiet: Row = {
  toolErrors: 0,
  edited: false,
  checkRan: false,
  checkFailed: false,
  checkPassed: false,
  doneUnchecked: false,
  userInterrupted: false,
  userCorrection: false,
  userNudge: false,
  userGoalChange: false,
  userRepeat: false,
  isResolved: false,
  userConfirm: false,
}
const plan = { thread: 'g', spec: 'p.md', done: 'tests pass', paths: [], cwd: '/w', home: '/home/w' }
const session = (more: Partial<State> = {}): State => ({ ...initial(), goal: plan, doneBoxes: 3, turns: 4, rows: [quiet, quiet, quiet], ...more })
const failed = { ...quiet, checkRan: true, checkFailed: true }

test('what the session needs from the person now, the most urgent first; nothing when it is going well', () => {
  const rows: [string, State, ReturnType<typeof adviceOf>][] = [
    ['three turns on the plan', session({ verdicts: ['on', 'on', 'on'] }), null],
    ['no plan and no message, three turns in', session({ goal: null, ask: '', turns: 3 }), { need: 'no-objective' }],
    ['three turns off track', session({ verdicts: ['off', 'off', 'off'], rows: [failed] }), { need: 'stalled' }],
    ['the last turn off track', session({ verdicts: ['on', 'off'], rows: [failed] }), { need: 'off-track' }],
    ['a check that failed', session({ rows: [{ ...quiet, edited: true }, failed] }), { need: 'failed' }],
    ['a done with no check', session({ rows: [{ ...quiet, doneUnchecked: true }] }), { need: 'unchecked' }],
    ['the last turn partly on the plan', session({ verdicts: ['on', 'partly'], rows: [{ ...quiet, edited: true }] }), { need: 'partly' }],
    ['two plans read in the window', session({ adopted: [{ source: 'p.md', at: 2 }, { source: 'q.md', at: 3 }] }), { need: 'two-plans' }],
    ['an edit not yet checked', session({ rows: [{ ...quiet, edited: true }] }), { need: 'owed' }],
    ['two corrections', session({ rows: [{ ...quiet, userCorrection: true }, { ...quiet, userRepeat: true }] }), { need: 'corrected', count: 2 }],
    ['corrections a fix cleared', session({ rows: [{ ...quiet, userCorrection: true }, { ...quiet, isResolved: true }] }), null],
    ['a nudge alone', session({ rows: [{ ...quiet, userNudge: true }] }), { need: 'doubted' }],
    ['an interrupt alone', session({ rows: [{ ...quiet, userInterrupted: true }] }), { need: 'doubted' }],
    ['two plans, the last turn partly on one', session({ verdicts: ['on', 'partly'], adopted: [{ source: 'p.md', at: 2 }, { source: 'q.md', at: 3 }] }), { need: 'two-plans' }],
  ]

  for (const [, state, need] of rows) expect(adviceOf(state)).toEqual(need)
})
