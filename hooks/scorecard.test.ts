import { expect, test } from 'claude-code/testing'

import type { Call, Row } from './scorecard'
import { COST, score, scripted } from './scorecard'

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
const row = (more: Partial<Row> = {}): Row => ({ ...quiet, ...more })
const passed = row({ checkRan: true, checkPassed: true })
const failed = row({ checkRan: true, checkFailed: true })
const edited = row({ edited: true })
const bash = (command: string, result = '', isError = false): Call => ({ tool: 'Bash', command, result, isError, isRefused: false })

test('a session with no turns scores its focus, a full verification and a full course', () => {
  expect(score([], 'goals')).toEqual({ total: 9, focus: 3, verification: 3, course: 3 })
  expect(score([], 'clear').total).toBe(10)
})

test("focus is the level's points: fragmented scores 2", () => {
  expect(score([passed], 'fragmented').total).toBe(8)
})

test('health never exceeds 5 under regroup or 3 under pause', () => {
  expect(score([passed], 'regroup').total).toBe(5)
  expect(score([passed], 'pause').total).toBe(3)
  expect(score([failed, row({ userCorrection: true })], 'pause').total).toBe(2)
})

test('verification: a passing check 3, a failing one 0, edits not yet checked 1, nothing owed 3', () => {
  expect(score([passed], 'goals').verification).toBe(3)
  expect(score([failed], 'goals').verification).toBe(0)
  expect(score([edited], 'goals').verification).toBe(1)
  expect(score([quiet], 'goals').verification).toBe(3)
  expect(score([failed, passed], 'goals').verification).toBe(3)
  expect(score([passed, edited], 'goals').verification).toBe(1)
  expect(score([edited, passed], 'goals').verification).toBe(3)
})

test('a done with no check scores 0 until a check passes, or the person confirms on the next turn', () => {
  const done = row({ doneUnchecked: true })
  expect(score([done], 'goals').verification).toBe(0)
  expect(score([done, quiet], 'goals').verification).toBe(0)
  expect(score([done, passed], 'goals').verification).toBe(3)
  expect(score([done, row({ userConfirm: true })], 'goals').verification).toBe(3)
  expect(score([done, quiet, row({ userConfirm: true })], 'goals').verification).toBe(0)
})

test('course control: a correction or repeat costs 1, a nudge or interrupt 0.2, a goal change nothing', () => {
  expect(COST).toEqual({ correction: 1, repeat: 1, nudge: 0.2, interrupt: 0.2 })
  expect(score([quiet], 'goals').course).toBe(3)
  expect(score([row({ userCorrection: true })], 'goals').course).toBe(2)
  expect(score([row({ userNudge: true })], 'goals').course).toBe(2.8)
  expect(score([row({ userInterrupted: true })], 'goals').course).toBe(2.8)
  expect(score([row({ userGoalChange: true })], 'goals').course).toBe(3)
  expect(score([row({ userCorrection: true, userRepeat: true }), row({ userRepeat: true })], 'goals').course).toBe(0)
})

test('a correction stops counting once a later turn resolves it', () => {
  const corrected = row({ userCorrection: true })
  expect(score([corrected, corrected, row({ isResolved: true })], 'goals').course).toBe(3)
  expect(score([corrected, row({ isResolved: true }), row({ userNudge: true })], 'goals').course).toBe(2.8)
})

test('with course control at 0 the total is capped at 4', () => {
  const s = score([row({ userCorrection: true }), row({ userRepeat: true }), row({ userCorrection: true, checkRan: true, checkPassed: true })], 'clear')
  expect(s.course).toBe(0)
  expect(s.focus + s.verification).toBe(7)
  expect(s.total).toBe(4)
})

test('each sign fades after 5 turns', () => {
  const signs = [row({ userCorrection: true }), row({ userRepeat: true })]
  expect(score([...signs, quiet, quiet, quiet], 'goals').course).toBe(1)
  expect(score([...signs, quiet, quiet, quiet, quiet], 'goals').course).toBe(2)
  expect(score([...signs, quiet, quiet, quiet, quiet, quiet], 'goals').course).toBe(3)
  expect(score([failed, quiet, quiet, quiet, quiet], 'goals').verification).toBe(0)
  expect(score([failed, quiet, quiet, quiet, quiet, quiet], 'goals').verification).toBe(3)
})

test('the scripted facts come from the message, the last words and the calls', () => {
  expect(scripted('', 'Done.', [])).toMatchObject({ doneUnchecked: true, checkRan: false })
  expect(scripted('', 'Done.', [bash('npm test', '12 pass')])).toMatchObject({ doneUnchecked: false, checkPassed: true })
  expect(scripted('', '', [bash('bun test', '2 failed')])).toMatchObject({ checkFailed: true, checkPassed: false })
  expect(scripted('', '', [bash('npm test', 'Tests: 0 failed, 12 passed')])).toMatchObject({ checkFailed: false, checkPassed: true })
  expect(scripted('', '', [{ ...bash('npm test'), isRefused: true }])).toMatchObject({ checkRan: false })
  expect(scripted('', '', [bash('ls')])).toMatchObject({ checkRan: false })
  expect(scripted('', '', [{ tool: 'Edit', command: '', result: '', isError: false, isRefused: false }])).toMatchObject({ edited: true })
  expect(scripted('looks good, ship it', '', [])).toMatchObject({ userConfirm: true })
  expect(scripted('[Request interrupted by user]', '', [])).toMatchObject({ userInterrupted: true })
})

test('"done" naming what done means is no claim of done', () => {
  expect(scripted('', "I'll write the plan; done means you approve it.", [])).toMatchObject({ doneUnchecked: false })
  expect(scripted('', 'Done when: the tests pass. Done looks like a green run.', [])).toMatchObject({ doneUnchecked: false })
  expect(scripted('', 'The fix is done.', [])).toMatchObject({ doneUnchecked: true })
})
