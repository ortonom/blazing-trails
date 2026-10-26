import type { State } from '../types'
import { correctionsOf, costOf, proofOf } from './scorecard'
import { hasNoObjective, hasRivalPlans, levelOf } from './state'

// What the session needs from the person now, the most urgent first, as the Health tab names it.
export type Need = 'no-objective' | 'stalled' | 'off-track' | 'failed' | 'unchecked' | 'two-plans' | 'partly' | 'owed' | 'corrected' | 'doubted'

export function adviceOf(s: State): { need: Need; count?: number } | null {
  const level = levelOf(s)
  if (level === 'pause') return { need: hasNoObjective(s) ? 'no-objective' : 'stalled' }
  if (level === 'regroup') return { need: 'off-track' }
  const proof = proofOf(s.rows)
  if (proof === 'failed' || proof === 'unchecked') return { need: proof }
  if (level === 'fragmented') return { need: hasRivalPlans(s) ? 'two-plans' : 'partly' }
  if (proof === 'owed') return { need: 'owed' }
  const count = correctionsOf(s.rows)
  if (count > 0) return { need: 'corrected', count }

  return costOf(s.rows) > 0 ? { need: 'doubted' } : null
}
