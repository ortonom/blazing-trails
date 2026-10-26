import type { Mark, Signal } from '../types'
import { hpParts, type Part } from './hp'

// A plan file the session touched, the label of the place it sits in, and whether it was written, read or named.
export type Place = { path: string; label: string; mark: Mark }

// The focus file: the health score, focus level and plan's short name, and the rows a status line draws as they are.
// v moves when the shape does, so a status line that reads another shape draws nothing.
type FocusFile = Signal & { v: 1; rows: Part[][]; places: Place[] }

export const focusFileOf = (signal: Signal, places: Place[], isUnread = false): FocusFile => ({
  v: 1,
  ...signal,
  rows: [hpParts(signal.health, signal.level, isUnread)],
  places,
})

type Env = { STATUSLINE_STATE?: string | null; CLAUDE_CONFIG_DIR?: string | null; HOME?: string | null }

// The folder the focus file is written to, as the status line looks for it; an empty variable counts as unset, as the
// shell's `:-` does, and with no folder to name there is none.
export function focusFolder(env: Env) {
  if (env.STATUSLINE_STATE) return env.STATUSLINE_STATE
  if (env.CLAUDE_CONFIG_DIR) return `${env.CLAUDE_CONFIG_DIR}/state`

  return env.HOME ? `${env.HOME}/.claude/state` : null
}

export const focusPath = (folder: string, sessionId: string) => `${folder}/focus-${sessionId}.json`
