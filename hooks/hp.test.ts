import { expect, test } from 'claude-code/testing'

import { hpParts } from './hp'

const text = (parts: ReturnType<typeof hpParts>) => parts.map(p => p.text).join('')

test('at 9 the bar is bright yellow, 18 cells earned and 2 spent, and the level is green', () => {
  const parts = hpParts(9, 'clear')

  expect(text(parts)).toBe('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬆ CLEAR GOAL')
  expect(parts.find(p => p.text.startsWith('■'))?.color).toBe('ansi256(11)')
  expect(parts.find(p => p.text.startsWith('□'))?.dim).toBe(true)
  expect(parts.at(-1)).toMatchObject({ text: '⬆ CLEAR GOAL', color: 'ansi256(2)' })
  expect(parts[0]).toMatchObject({ text: 'HP', color: 'ansi256(3)', bold: true })
})

test('at 5 the bar is yellow, the score carries one mark, and goals is cyan', () => {
  const parts = hpParts(5, 'goals')

  expect(text(parts)).toBe('HP ■■■■■■■■■■□□□□□□□□□□ 5 ! · ⬈ GOALS')
  expect(parts.find(p => p.text === '5 !')?.color).toBe('ansi256(3)')
  expect(parts.at(-1)?.color).toBe('ansi256(6)')
})

test('at 2 the bar is red with two marks, and fragmented is yellow', () => {
  const parts = hpParts(2, 'fragmented')

  expect(text(parts)).toBe('HP ■■■■□□□□□□□□□□□□□□□□ 2 !! · ⇄ FRAGMENTED')
  expect(parts.find(p => p.text === '2 !!')?.color).toBe('ansi256(1)')
  expect(parts.at(-1)?.color).toBe('ansi256(3)')
})

test('at 0 it reads K.O., and regroup is red while pause is bold red', () => {
  expect(text(hpParts(0, 'regroup'))).toBe('HP □□□□□□□□□□□□□□□□□□□□ K.O. · ↺ REGROUP')
  expect(hpParts(0, 'regroup').at(-1)).toMatchObject({ color: 'ansi256(1)' })
  expect(hpParts(0, 'pause').at(-1)).toMatchObject({ text: '‖ PAUSE', color: 'ansi256(1)', bold: true })
})

test('every part reads in plain ASCII where the terminal has no UTF-8 locale', () => {
  for (const level of ['clear', 'goals', 'fragmented', 'regroup', 'pause'] as const)
    for (const hp of [0, 5, 10]) expect(hpParts(hp, level).map(p => p.ascii ?? p.text).join('')).toMatch(/^[ -~]+$/)
  expect(hpParts(9, 'clear').map(p => p.ascii ?? p.text).join('')).toBe('HP ##################-- 9 - CLEAR GOAL')
})

test('a health outside 0 to 10 is drawn at the nearest end', () => {
  expect(text(hpParts(14, 'clear'))).toContain('■'.repeat(20) + ' 10')
  expect(text(hpParts(-3, 'pause'))).toContain('K.O.')
})
