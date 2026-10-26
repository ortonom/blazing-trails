import { expect, test } from 'claude-code/testing'

import type { State } from '../types'
import { jsonIn } from './model'
import { initial } from './state'
import { judgedOf, judgeOf, parseMarks, readPrompt } from './turn-judge'

const parseJudge = (text: string) => judgeOf(jsonIn(text))

test("the judge's verdict is on, partly or off from its JSON, and unknown otherwise", () => {
  expect(parseJudge('{"focus": "on"}')).toBe('on')
  expect(parseJudge('{"focus": "partly"}')).toBe('partly')
  expect(parseJudge('Sure: {"focus": "off"}')).toBe('off')
  expect(parseJudge('{"focus": "maybe"}')).toBe('unknown')
  expect(parseJudge('{"focus": ')).toBe('unknown')
  expect(parseJudge('no json')).toBe('unknown')
})

test("the focus read's marks: correction and repeat required, the softer marks default to unmarked", () => {
  expect(parseMarks({ userCorrection: true, userRepeat: false })).toEqual({ userCorrection: true, userNudge: false, userGoalChange: false, userRepeat: false, isResolved: false })
  expect(parseMarks({ userCorrection: true, userNudge: true, userRepeat: false })?.userNudge).toBe(false)
  expect(parseMarks({ userCorrection: true, userGoalChange: true, userRepeat: false })).toMatchObject({ userCorrection: false, userGoalChange: true })
  expect(parseMarks({ userCorrection: false, userNudge: true, isResolved: true, userRepeat: false })).toMatchObject({ userNudge: true, isResolved: true })
  expect(parseMarks({ userCorrection: 'yes', userRepeat: false })).toBe(null)
  expect(parseMarks(null)).toBe(null)
})

test('the focus read opens with the goal, and says so when there is none', () => {
  const c = { goal: '', done: '', earlier: [], prior: '', latest: 'hi', answer: 'hello' }
  expect(readPrompt(c).startsWith('Goal: (none stated)\nDone when: (not stated)')).toBe(true)
  expect(readPrompt({ ...c, goal: 'g', done: 'tests pass' }).startsWith('Goal: g\nDone when: tests pass')).toBe(true)
})

test('a turn is judged against the plan, else the first message, else nothing; a redirect scores no edits and is not read', () => {
  const plan = { thread: 'g', spec: 'p.md', done: 'tests pass', paths: ['mods/hq'], cwd: '/w', home: '/home/w' }
  const sealed = (more: Partial<State> = {}): State => ({ ...initial(), edits: { inside: 2, outside: 1 }, ...more })
  const ended = (ranSkill = '') => ({ said: 'go on', prior: 'fix it', earlier: ['hi'], made: [], ranSkill })
  const answered = { isAnswer: true, answer: 'done', isAborted: false }

  expect(judgedOf(sealed({ goal: plan }), ended(), answered)).toEqual({ goal: plan, edits: { inside: 2, outside: 1 }, earlier: ['hi'], prior: 'fix it', said: 'go on', answer: 'done', made: [], isAborted: false })
  expect(judgedOf(sealed({ ask: 'make the sender retry' }), ended(), answered).goal).toMatchObject({ thread: 'make the sender retry', spec: '' })
  expect(judgedOf(sealed(), ended(), answered).goal).toBe(null)
  expect(judgedOf(sealed({ goal: plan }), ended('skill:review'), answered)).toMatchObject({ goal: plan, edits: { inside: 0, outside: 0 }, answer: null })
  expect(judgedOf(sealed({ goal: plan }), ended('p.md'), answered)).toMatchObject({ edits: { inside: 2, outside: 1 }, answer: 'done' })
  expect(judgedOf(sealed({ goal: plan }), ended(), { isAnswer: false, answer: '', isAborted: true })).toMatchObject({ answer: null, isAborted: true })
})
