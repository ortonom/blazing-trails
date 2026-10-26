import { expect, test } from 'claude-code/testing'

import type { Call } from './scorecard'
import { asked, called, endTurn, forget, heard, isLive, memoryOf, skillStarted } from './session-memory'
import { EARLIER } from './turn-judge'

test('one session id keeps one memory', () => {
  const m = memoryOf('a')
  m.priorPrompt = 'fix the sender'

  expect(memoryOf('a')).toBe(m)
  expect(memoryOf('a').priorPrompt).toBe('fix the sender')
  expect(isLive(m)).toBe(true)
})

test('another session id starts fresh memory, and the old one is no longer live', () => {
  const old = memoryOf('b')
  old.calls.push({ tool: 'Bash', command: 'ls', result: '', isError: false, isRefused: false })
  const next = memoryOf('c')

  expect(next).not.toBe(old)
  expect(next.calls).toEqual([])
  expect(isLive(old)).toBe(false)
  expect(isLive(next)).toBe(true)
})

test('another session id carries over the turn in flight: its message, prompts typed ahead and skills asked', () => {
  const old = memoryOf('e')
  old.turn.lastPrompt = 'go'
  old.turn.asked.add('review')

  expect(memoryOf('f').turn.lastPrompt).toBe('go')
  expect([...memoryOf('f').turn.asked]).toEqual(['review'])
})

test('forget starts fresh memory under the same session id', () => {
  const old = memoryOf('d')
  old.turn.asked.add('review')
  forget()

  expect(isLive(old)).toBe(false)
  expect(memoryOf('d')).not.toBe(old)
  expect(memoryOf('d').turn.asked.size).toBe(0)
})

const bash: Call = { tool: 'Bash', command: 'npm test', result: '', isError: false, isRefused: false }

test("a turn's end gives its message, the one before and the earlier ones, then moves each back one", () => {
  const m = memoryOf('t1')
  const views = ['one', 'two', 'three'].map(said => {
    heard(m, said, false)
    const { said: latest, prior, earlier } = endTurn(m)
    return { latest, prior, earlier }
  })

  expect(views).toEqual([
    { latest: 'one', prior: '', earlier: [] },
    { latest: 'two', prior: 'one', earlier: [] },
    { latest: 'three', prior: 'two', earlier: ['one'] },
  ])
})

test('the earlier messages keep only the last EARLIER', () => {
  const m = memoryOf('t2')
  const all = Array.from({ length: EARLIER + 4 }, (_, i) => `m${i}`)
  let earlier: string[] = []
  for (const said of all) {
    heard(m, said, false)
    earlier = endTurn(m).earlier
  }

  expect(earlier).toEqual(all.slice(-EARLIER - 2, -2))
})

test("prompts typed while a turn runs are the next turn's latest message", () => {
  const m = memoryOf('t3')
  heard(m, 'a', false)
  heard(m, 'b', true)
  heard(m, 'c', true)

  expect(endTurn(m).said).toBe('a')
  expect(endTurn(m).said).toBe('b\nc')
})

test('a turn with no new message leaves the messages where they stood', () => {
  const m = memoryOf('t4')
  heard(m, 'one', false)
  endTurn(m)
  expect(endTurn(m)).toMatchObject({ said: '', prior: 'one', earlier: [] })
  heard(m, 'two', false)

  expect(endTurn(m)).toMatchObject({ said: 'two', prior: 'one', earlier: [] })
})

test("a turn's calls are taken once", () => {
  const m = memoryOf('t5')
  called(m, bash)

  expect(endTurn(m).made).toEqual([bash])
  expect(endTurn(m).made).toEqual([])
})

test('a skill asked for by either name starts as a plan source once, and the turn ran it', () => {
  const m = memoryOf('t6')
  asked(m, 'ortonom:review')
  expect(skillStarted(m, 'other')).toBe(null)
  expect(skillStarted(m, 'review')).toBe('skill:review')
  expect(skillStarted(m, 'review')).toBe(null)
  expect(endTurn(m).ranSkill).toBe('skill:review')

  asked(m, 'review')
  expect(skillStarted(m, 'ortonom:review')).toBe('skill:ortonom:review')
  expect(endTurn(m).ranSkill).toBe('skill:ortonom:review')
  expect(endTurn(m).ranSkill).toBe('')
})

test("a turn's end forgets the skills asked for in it", () => {
  const m = memoryOf('t7')
  asked(m, 'review')
  endTurn(m)

  expect(skillStarted(m, 'review')).toBe(null)
})
