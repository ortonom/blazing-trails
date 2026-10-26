import type { Color, Level } from '../types'
import { LEVELS } from './level'

// One run of a row, as the pane and the status line both draw it; ascii is the text where the terminal has no UTF-8 locale.
export type Part = { text: string; ascii?: string; color?: Color; bold?: boolean; dim?: boolean }

// The arcade HP row: two cells a point, bright yellow from 7, yellow from 4, red below, spent cells dim, one mark on the
// score at 4 to 6 and two at 1 to 3, K.O. at 0, then the level, and a dim ? while the last turn could not be read.
export function hpParts(raw: number, level: Level, isUnread = false): Part[] {
  const hp = Math.max(0, Math.min(10, Math.round(raw)))
  const bar: Color = hp >= 7 ? 'ansi256(11)' : hp >= 4 ? 'ansi256(3)' : 'ansi256(1)'
  const score = hp >= 7 ? `${hp}` : hp >= 4 ? `${hp} !` : hp >= 1 ? `${hp} !!` : 'K.O.'
  const { drawn, color, bold } = LEVELS[level]
  return [
    { text: 'HP', color: 'ansi256(3)', bold: true },
    { text: ' ' },
    ...(hp > 0 ? [{ text: '■'.repeat(hp * 2), ascii: '#'.repeat(hp * 2), color: bar }] : []),
    // A pane draws dim in the theme's dim colour in place of any colour, so it has no faint bar colour as the status line does.
    ...(hp < 10 ? [{ text: '□'.repeat((10 - hp) * 2), ascii: '-'.repeat((10 - hp) * 2), dim: true }] : []),
    { text: ' ' },
    { text: score, color: bar },
    { text: ' · ', ascii: ' - ', dim: true },
    // The level's arrow is its first word.
    { text: drawn, ascii: drawn.slice(drawn.indexOf(' ') + 1), color, ...(bold ? { bold } : {}) },
    ...(isUnread ? [{ text: ' ?', dim: true }] : []),
  ]
}
