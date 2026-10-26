import { expect, test } from 'claude-code/testing'

import { LEVELS } from './level'

const each = <T>(of: (l: (typeof LEVELS)[keyof typeof LEVELS]) => T) => Object.fromEntries(Object.entries(LEVELS).map(([level, l]) => [level, of(l)]))

test('the levels run from clear to pause', () => {
  expect(Object.keys(LEVELS)).toEqual(['clear', 'goals', 'fragmented', 'regroup', 'pause'])
})

test('focus scores 4 at clear down to 0 at pause, and regroup and pause hold health to 5 and 3', () => {
  expect(each(l => l.points)).toEqual({ clear: 4, goals: 3, fragmented: 2, regroup: 1, pause: 0 })
  expect(each(l => l.cap)).toEqual({ clear: 10, goals: 10, fragmented: 10, regroup: 5, pause: 3 })
})

test('every level is drawn in one of the 16 colours, as its arrow then its name', () => {
  for (const l of Object.values(LEVELS)) {
    expect(l.color).toMatch(/^ansi256\(([0-9]|1[0-5])\)$/)
    expect(l.drawn).toMatch(/^\S \p{Lu}[\p{Lu} ]*$/u)
  }
})
