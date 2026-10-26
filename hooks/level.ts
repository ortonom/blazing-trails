import type { Color, Level } from '../types'

// How many judged turns the level reads back.
export const RECENT = 3

// Each focus level: the points it gives the health score's focus part, the most health it allows, and how the status
// line and the pane draw it.
export const LEVELS: Record<Level, { points: number; cap: number; color: Color; bold?: boolean; drawn: string }> = {
  clear: { points: 4, cap: 10, color: 'ansi256(2)', drawn: '⬆ CLEAR GOAL' },
  goals: { points: 3, cap: 10, color: 'ansi256(6)', drawn: '⬈ GOALS' },
  fragmented: { points: 2, cap: 10, color: 'ansi256(3)', drawn: '⇄ FRAGMENTED' },
  regroup: { points: 1, cap: 5, color: 'ansi256(1)', drawn: '↺ REGROUP' },
  pause: { points: 0, cap: 3, color: 'ansi256(1)', bold: true, drawn: '‖ PAUSE' },
}
