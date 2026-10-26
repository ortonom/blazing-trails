import { expect, test } from 'claude-code/testing'

import type { Edits, Event, Goal, Judge, Level, State } from '../types'
import type { Row } from './scorecard'
import { FAMILY, ON_TRACK, READ_KEY, SIDE_QUEST, STATE_KEY, alignment, band, goalOf, initial, isState, levelOf, planName, planSource, reduce, resolve, scopePath, signal } from './state'

const at = { cwd: '/w', home: '/home/w' }
const goal = (thread: string, more: { source?: string; paths?: string[]; boxes?: number; done?: string } = {}): Event => ({
  type: 'read',
  source: more.source ?? 'p.md',
  goal: thread,
  done: more.done ?? 'tests pass',
  paths: more.paths ?? [],
  boxes: more.boxes ?? 3,
  ...at,
})
const edit = (path: string): Event => ({ type: 'edit', path })
const none: Edits = { inside: 0, outside: 0 }
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
const passed: Row = { ...quiet, checkRan: true, checkPassed: true }
const ask = (text = 'make the sender retry'): Event => ({ type: 'ask', text })
const end: Event = { type: 'turnEnd' }
// One ended turn, judged against the goal in force when its source is `spec` ('' for the first message), as the hook
// judges it, else against a goal of that source no longer in force.
type Step = Event | ((s: State) => Event)
const judged = (s: State, spec: string): Goal | null => {
  const g = goalOf(s)
  return (g?.spec ?? '') === spec ? g : { thread: 'an older goal', spec, done: '', paths: [], ...at }
}
const turn = (judge: Judge, spec = 'p.md', edits = none, rows: Row[] = [quiet]): Step[] => [
  end,
  s => ({ type: 'turn', goal: judged(s, spec), edits, judge, rows, reading: 'read' }),
]

const onTrack = [turn('on'), turn('on'), turn('on')]

const run = (events: readonly (Step | Step[])[], from: State = initial()) => events.flat().reduce((s, e) => reduce(s, typeof e === 'function' ? e(s) : e), from)
const scoped = goal('g', { paths: ['mods/hq'] })

const levels: [string, (Step | Step[])[], Level][] = [
  ['a new session', [], 'goals'],
  ['a first message, not yet judged', [ask()], 'goals'],
  ['an unfocused first turn', [ask(), turn('partly', '')], 'fragmented'],
  ['a focused turn with no plan', [ask(), turn('partly', ''), turn('on', '')], 'goals'],
  ['a plan written, not yet 3 turns on it', [ask(), turn('on', ''), goal('g')], 'goals'],
  ['two turns that serve the plan', [ask(), goal('g'), turn('on'), turn('on')], 'goals'],
  ['three turns that serve a plan with done boxes', [ask(), goal('g'), ...onTrack], 'clear'],
  ['three turns that serve a plan with no done boxes', [goal('g', { boxes: 0 }), ...onTrack], 'goals'],
  ['three turns on a spec stated in conversation', [ask(), ...Array.from({ length: 3 }, () => turn('on', ''))], 'goals'],
  ['scope creep under the plan', [goal('g'), ...onTrack, turn('partly')], 'fragmented'],
  ['a second plan within 5 turns', [goal('g'), ...onTrack, goal('h', { source: 'q.md' })], 'fragmented'],
  ['a second plan read 5 turns after the first, then 3 turns on it', [goal('g'), ...onTrack, turn('on'), turn('on'), goal('h', { source: 'q.md' }), ...Array.from({ length: 3 }, () => turn('on', 'q.md'))], 'clear'],
  ['the same plan read again', [goal('g'), ...onTrack, goal('g')], 'clear'],
  ['a turn off the plan', [goal('g'), turn('on'), turn('off')], 'regroup'],
  ['a turn off the first message', [ask(), turn('off', '')], 'regroup'],
  ['three turns off the plan', [goal('g'), turn('off'), turn('off'), turn('off')], 'pause'],
  ['three turns with no goal at all', [turn('unknown', ''), turn('unknown', ''), turn('unknown', '')], 'pause'],
  ['back on after a turn off', [goal('g'), turn('off'), turn('on')], 'goals'],
  ['three turns back on after a turn off', [goal('g'), turn('off'), ...onTrack], 'clear'],
]

for (const [name, events, level] of levels) test(`level: ${name} is ${level}`, () => expect(levelOf(run(events))).toBe(level))

test('the level climbs fragmented, goals, clear, and falls back down to regroup and pause', () => {
  const steps: (Step | Step[])[] = [ask(), turn('partly', ''), turn('on', ''), goal('g'), turn('on'), turn('on'), turn('on'), turn('off'), turn('off'), turn('off')]
  const seen: Level[] = []
  let s = initial()
  for (const step of steps) {
    s = run([step], s)
    seen.push(levelOf(s))
  }

  expect(seen).toEqual(['goals', 'fragmented', 'goals', 'goals', 'goals', 'goals', 'clear', 'regroup', 'regroup', 'pause'])
})

test('the signal is health, level and the plan file\'s name', () => {
  expect(signal(initial())).toEqual({ health: 9, level: 'goals', plan: '' })
  expect(signal(run([goal('g', { source: '/w/docs/plans/bearings.md' })]))).toEqual({ health: 9, level: 'goals', plan: 'bearings.md' })
  expect(signal(run([goal('g', { source: '/w/docs/plans/bearings.md' }), ...Array.from({ length: 3 }, () => turn('on', '/w/docs/plans/bearings.md'))]))).toEqual({ health: 10, level: 'clear', plan: 'bearings.md' })
  expect([planName('https://github.com/o/r/issues/7'), planName('skill:review'), planName('plan mode')]).toEqual(['7', 'skill:review', 'plan mode'])
})

test('the three sample sessions: off track with a passing check, a spec in conversation, a clear goal', () => {
  const offTrack = run([goal('g'), turn('off', 'p.md', none, [passed]), turn('off'), turn('off')])
  const talk = run([ask(), turn('on', ''), turn('on', ''), turn('on', '')])
  const clear = run([goal('g'), turn('on', 'p.md', none, [passed]), turn('on'), turn('on')])

  expect([signal(offTrack), signal(talk), signal(clear)].map(s => `${s.health} ${s.level}`)).toEqual(['3 pause', '9 goals', '10 clear'])
})

test('the done boxes are counted once, when the plan is read, with no upper limit', () => {
  expect(run([goal('g', { boxes: 1 })]).doneBoxes).toBe(1)
  expect(run([goal('g', { boxes: 25 })]).doneBoxes).toBe(25)
  expect(run([goal('g', { boxes: 0 })]).doneBoxes).toBe(0)
  const bare: Event = { type: 'read', source: 'p.md', goal: 'g', done: '', paths: [], boxes: 3, ...at }
  expect(run([goal('g'), bare]).doneBoxes).toBe(0)
})

test('a verdict counts against the goal it was judged on; its rows always count', () => {
  const s = run([goal('g'), turn('off', 'q.md')])
  expect(s.verdicts).toEqual([])
  expect(s.rows).toHaveLength(1)
  expect(run([ask(), goal('g'), turn('off', '')]).verdicts).toEqual([])
})

test('only the first substantive message is the ask, and only the last 5 rows and 3 verdicts are kept', () => {
  expect(run([ask('first one here'), ask('second one here')]).ask).toBe('first one here')
  const s = run([goal('g'), ...Array.from({ length: 7 }, () => turn('on'))])
  expect(s.rows).toHaveLength(5)
  expect(run([goal('g'), ...Array.from({ length: 5 }, () => turn('on'))]).verdicts).toHaveLength(3)
})

test('a judged turn is on at 0.7, partly at 0.35, off below', () => {
  expect([ON_TRACK, SIDE_QUEST]).toEqual([0.7, 0.35])
  expect([1, 0.7, 0.69, 0.35, 0.34, 0].map(band)).toEqual(['on', 'on', 'partly', 'partly', 'off', 'off'])
})

test('alignment is the mean of what is known: the share of edits in scope and the verdict', () => {
  expect(alignment({ inside: 0, outside: 0 }, 'unknown')).toBe(null)
  expect(alignment({ inside: 3, outside: 1 }, 'unknown')).toBe(0.75)
  expect(alignment({ inside: 0, outside: 0 }, 'off')).toBe(0)
  expect(alignment({ inside: 0, outside: 0 }, 'partly')).toBe(0.5)
  expect(alignment({ inside: 1, outside: 1 }, 'on')).toBe(0.75)
})

test('edits count only against a plan that names paths, and the plan file is in scope', () => {
  const plain = run([goal('g'), edit('/w/bin/x')])
  expect(plain.edits).toEqual({ inside: 0, outside: 0 })
  const named = run([goal('g', { source: 'docs/p.md', paths: ['mods/hq'] }), edit('/w/docs/p.md'), edit('/w/mods/hq/a'), edit('/w/bin/x')])
  expect(named.edits).toEqual({ inside: 2, outside: 1 })
  expect(run([end], named).edits).toEqual({ inside: 0, outside: 0 })
})

test('a plan read again with the same goal and done keeps its verdicts; a new goal, done or source starts them over', () => {
  const s = run([scoped, turn('partly')])
  expect(run([goal('g', { boxes: 5 })], s).verdicts).toEqual(['partly'])
  expect(run([goal('g', { paths: ['src'] })], s).verdicts).toEqual(['partly'])
  expect(run([goal('g2', { paths: ['mods/hq'] })], s).verdicts).toEqual([])
  expect(run([goal('g', { paths: ['mods/hq'], done: 'it ships' })], s).verdicts).toEqual([])
  expect(run([goal('g', { paths: ['mods/hq'], source: 'q.md' })], s).verdicts).toEqual([])
})

test('the plan comes from an issue, a file, or nowhere', () => {
  expect(planSource('#513', '/w', '/home/w')).toEqual({ kind: 'issue', number: '513' })
  expect(planSource('GitHub issue #513', '/w', '/home/w')).toEqual({ kind: 'issue', number: '513' })
  expect(planSource('https://github.com/o/r/issues/7', '/w', '/home/w')).toEqual({ kind: 'issue', number: '7', repo: 'o/r' })
  expect(planSource('docs/plans/p.md', '/w', '/home/w')).toEqual({ kind: 'file', path: '/w/docs/plans/p.md' })
  expect(planSource('~/notes/p.md', '/w', '/home/w')).toEqual({ kind: 'file', path: '/home/w/notes/p.md' })
  expect(planSource('ADM-17', '/w', '/home/w')).toEqual({ kind: 'none' })
  expect(planSource('https://linear.app/x/issue/ADM-17', '/w', '/home/w')).toEqual({ kind: 'none' })
})

test('paths resolve with . and .. collapsed, so a scope of . holds every edit under it', () => {
  expect(resolve('.', '/w', '/home/w')).toBe('/w')
  expect(resolve('./', '/w', '/home/w')).toBe('/w')
  expect(resolve('src/../lib/', '/w', '/home/w')).toBe('/w/lib')
  expect(run([goal('g', { paths: ['.'] }), edit('/w/src/a.ts')]).edits).toEqual({ inside: 1, outside: 0 })
})

test('only a state of this shape is loaded', () => {
  expect(isState(initial())).toBe(true)
  expect(isState({ goal: null, plan: null, turns: [], failures: {} })).toBe(false)
  expect(isState({ goal: null, edits: { inside: 0, outside: 0 }, focus: 1 })).toBe(false)
  expect(isState(undefined)).toBe(false)
})

test('a bare filename matches wherever it sits, and a glob keeps the folder before it', () => {
  expect(scopePath('focus.tsx', '/w', '/h')).toBe('*/focus.tsx')
  expect(scopePath('src/**', '/w', '/h')).toBe('/w/src')
  expect(scopePath('src/*.ts', '/w', '/h')).toBe('/w/src')
  const s = run([goal('g', { paths: ['focus.tsx', 'lib/**'] }), edit('/w/plugins/x/focus.tsx'), edit('/w/lib/a/b.ts'), edit('/w/other.ts')])
  expect(s.edits).toEqual({ inside: 2, outside: 1 })
})

// prune clears old keys by the family's prefix, so a key outside it would never be cleared.
test("every store key is in the focus family, whose old keys prune clears", () => {
  expect([STATE_KEY, READ_KEY].filter(k => !k.startsWith(FAMILY))).toEqual([])
})

test("a verdict judged on a plan's goal counts only while that goal stands: a re-read with a new goal drops it, a ticked box keeps it", () => {
  const before = run([goal('g'), turn('on')])
  const onG = goalOf(before)
  const verdict = (s: State): Event => ({ type: 'turn', goal: onG, edits: none, judge: 'on', rows: [quiet], reading: 'read' })

  expect(reduce(run([goal('h')], before), verdict(run([goal('h')], before))).verdicts).toEqual([])
  expect(reduce(run([goal('g', { boxes: 4 })], before), verdict(before)).verdicts).toEqual(['on', 'on'])
})

test('the goal in force is the plan, else the first message, else none', () => {
  expect(goalOf(run([ask('fix the sender now')]))).toMatchObject({ thread: 'fix the sender now', spec: '', done: '' })
  expect(goalOf(run([ask(), goal('g')]))).toMatchObject({ thread: 'g', spec: 'p.md', done: 'tests pass' })
  expect(goalOf(initial())).toBe(null)
})
