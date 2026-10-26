// One turn's facts for the health score: what the scripts saw of its calls and messages, and what the focus read marked.
export type Row = {
  toolErrors: number
  edited: boolean
  checkRan: boolean
  checkFailed: boolean
  checkPassed: boolean
  doneUnchecked: boolean
  userInterrupted: boolean
  userCorrection: boolean
  userNudge: boolean
  userGoalChange: boolean
  userRepeat: boolean
  isResolved: boolean
  userConfirm: boolean
}

export type Count = { ticked: number; total: number }

// What a plan read found: whether the text is a plan, its goal in a few words, how it says the work is done, how many
// checkboxes state done, and the files or folders it names.
export type Answer = { isPlan: boolean; goal: string; done: string; doneBoxes?: number; paths: string[] }

// The turn judge's verdict on whether a turn served the goal.
export type Judge = 'on' | 'partly' | 'off' | 'unknown'
// A judged turn's place against the goal, from the verdict and the share of its edits in the plan's scope.
export type Verdict = 'on' | 'partly' | 'off'

// boxes: the checkboxes that state the plan's done.
export type Read = { type: 'read'; source: string; goal: string; done: string; paths: string[]; boxes: number; cwd: string; home: string }
export type Edits = { inside: number; outside: number }
// A plan file the session touched: written, read, or only named in a command.
export type Mark = 'w' | 'r' | 'b'
export type Touch = { path: string; mark: Mark }
export type Event =
  | Read
  | { type: 'edit'; path: string }
  | { type: 'touch'; path: string; mark: Mark }
  | { type: 'ask'; text: string }
  | { type: 'turnEnd' }
  | { type: 'turn'; goal: Goal | null; edits: Edits; judge: Judge; rows: Row[]; reading: Reading }

export type Source = { kind: 'file'; path: string } | { kind: 'issue'; number: string; repo?: string } | { kind: 'none' }
export type Goal = { thread: string; spec: string; done: string; paths: string[]; cwd: string; home: string }
export type Adopted = { source: string; at: number }
export type State = {
  goal: Goal | null
  // The checkboxes that state the plan in force's done, counted when it is read.
  doneBoxes: number
  edits: Edits
  // The session's first substantive message, the goal each turn is judged against while there is no plan.
  ask: string
  // Turns counted so far, the clock the 5-turn window of plans is read on; a turn nothing could be read from is not one.
  turns: number
  adopted: Adopted[]
  // The last 3 judged turns' verdicts since the plan in force was adopted.
  verdicts: Verdict[]
  rows: Row[]
  // The last turn the judge was asked to read could not be read, and no turn has been read since.
  isUnread: boolean
  // The plan files the session touched, in the order it first touched each, for the status line's plan row.
  touched: Touch[]
}
export type Level = 'clear' | 'goals' | 'fragmented' | 'regroup' | 'pause'
// One of the terminal's own 16 colours, by index, so a row follows the person's scheme.
export type Color = `ansi256(${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15})`
// How a turn's read went: read, asked and failed, or never asked (a turn with no answer).
export type Reading = 'read' | 'failed' | 'none'
export type Signal = { health: number; level: Level; plan: string }
// typed: the name that runs it, bare unless another command owns the bare name; note: what this session found of a companion the skill uses, drawn under it.
export type Skill = { name: string; typed: string; does: string; isCommand: boolean; note?: string }
export type Tab = 'health' | 'commands' | 'about'
export type Companion = { name: string; usedBy: string; isFound: boolean; found: string; missing: string }
export type About = { version: string; companions: Companion[] }

declare module 'claude-code' {
  interface PluginState {
    ortonom: { focusV1: State; focusForV1: string; skills: Skill[]; tab: Tab; about: About }
  }
}
