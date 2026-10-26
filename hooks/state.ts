import type { Edits, Event, Goal, Judge, Level, Read, Reading, Signal, Source, State, Touch, Verdict } from '../types'
import { RECENT } from './level'
import { isBlank, WINDOW, score, type Score } from './scorecard'

// The store's keys carry the state shape's version, as the focus atom's key does, so a value of an older shape is never
// found; prune clears every key of the family, whatever its version. tests/state-version.test.sh holds every copy of
// the version to one number.
export const FAMILY = 'focus'
export const STATE_KEY = 'focusV1:'
export const READ_KEY = 'focusV1read:'

// A judged turn on goal at 0.7 of alignment or more, partly at 0.35 or more, off below.
export const ON_TRACK = 0.7
export const SIDE_QUEST = 0.35

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

export const initial = (): State => ({
  goal: null,
  doneBoxes: 0,
  edits: { inside: 0, outside: 0 },
  ask: '',
  turns: 0,
  adopted: [],
  verdicts: [],
  rows: [],
  isUnread: false,
  touched: [],
})

// A stored state is trusted only when it has this shape; anything older starts over.
export const isState = (x: unknown): x is State =>
  !!x &&
  typeof x === 'object' &&
  'goal' in x &&
  ((x as State).goal === null || Array.isArray((x as State).goal?.paths)) &&
  typeof (x as State).doneBoxes === 'number' &&
  typeof (x as State).ask === 'string' &&
  typeof (x as State).turns === 'number' &&
  typeof (x as State).edits?.inside === 'number' &&
  typeof (x as State).edits?.outside === 'number' &&
  Array.isArray((x as State).adopted) &&
  Array.isArray((x as State).verdicts) &&
  Array.isArray((x as State).rows)

// A stored state as the session takes it up: one saved before the plan files touched were kept has touched none, and one
// saved before unread turns were marked has none.
export const loaded = (x: unknown): State =>
  isState(x) ? { ...x, touched: Array.isArray(x.touched) ? x.touched : [], isUnread: x.isUnread === true } : initial()

// How many plan files the session keeps, the latest first touched kept.
const MOST_TOUCHED = 50
const RANK = { b: 0, r: 1, w: 2 } as const

// A file written stays written and one read stays read, whatever touches it after.
function touch(s: State, path: string, mark: Touch['mark']): State {
  const at = s.touched.findIndex(t => t.path === path)
  if (at < 0) return { ...s, touched: [...s.touched, { path, mark }].slice(-MOST_TOUCHED) }
  if (RANK[mark] <= RANK[s.touched[at]!.mark]) return s

  return { ...s, touched: s.touched.map((t, i) => (i === at ? { path, mark } : t)) }
}

// An absolute path with `.` and `..` collapsed, from a path as a plan or a tool wrote it.
export function resolve(raw: string, cwd: string, home: string) {
  const p = raw.trim()
  const full = p.startsWith('/') ? p : p === '~' || p.startsWith('~/') ? `${home}${p.slice(1)}` : `${cwd}/${p}`
  const parts: string[] = []
  for (const part of full.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }

  return `/${parts.join('/')}`
}

// A scope path is a file or folder, or `*/name` for a bare filename that matches wherever it sits.
const inside = (file: string, paths: readonly string[]) =>
  paths.some(p => (p.startsWith('*/') ? file.endsWith(p.slice(1)) : file === p || file.startsWith(p === '/' ? p : `${p}/`)))

// A path as a plan writes it, made matchable: a glob keeps the folder before it, a bare filename matches by its end.
export function scopePath(raw: string, cwd: string, home: string) {
  const p = raw.trim().replace(/^`|`$/g, '')
  const star = p.search(/[*?[{]/)
  if (star >= 0) return resolve(p.slice(0, star).replace(/[^/]*$/, '') || '.', cwd, home)
  if (/^[\w-][\w.-]*\.\w+$/.test(p)) return `*/${p}`

  return resolve(p, cwd, home)
}

// Where a plan can be read: a GitHub issue by number or URL, a file by path; a Linear id or any other URL has none.
export function planSource(spec: string, cwd: string, home: string): Source {
  const s = spec.trim()
  const url = s.match(/github\.com\/([^/\s]+\/[^/\s]+)\/issues\/(\d+)/)
  if (url) return { kind: 'issue', number: url[2]!, repo: url[1]! }
  if (/^\w+:\/\//.test(s) || /^[A-Z][A-Z0-9]*-\d+$/.test(s) || !s) return { kind: 'none' }
  const issue = s.match(/(?:^|\s)#(\d+)\b/)
  if (issue) return { kind: 'issue', number: issue[1]! }

  return { kind: 'file', path: resolve(s, cwd, home) }
}

// The plan's own file, or the folder a folder plan is, which is always inside its scope.
function planFile(g: Goal) {
  const source = planSource(g.spec, g.cwd, g.home)

  return source.kind === 'file' ? source.path : null
}

const isInPlan = (file: string, plan: string | null) => !!plan && (file === plan || file.startsWith(`${plan}/`))

const recentPlans = (s: State) => new Set(s.adopted.filter(p => p.at > s.turns - WINDOW).map(p => p.source))

// One goal for its verdicts: the same source, goal and done.
const isSameGoal = (a: Goal | null, b: Goal | null) => a?.spec === b?.spec && a?.thread === b?.thread && a?.done === b?.done

// A plan from the goal's own source restates goal, done and paths, and keeps its verdicts while its goal and done stand;
// a new goal or done starts them over, and any other source starts the turn's edits over too.
// A plan that no longer says what done looks like is no plan.
function read(s: State, r: Read): State {
  if (!r.done.trim()) return s.goal?.spec === r.source ? { ...s, goal: null, doneBoxes: 0, verdicts: [] } : s
  const paths = r.paths.map(p => scopePath(p, r.cwd, r.home))
  const fresh: Goal = { thread: flat(r.goal), spec: r.source, done: flat(r.done), paths, cwd: r.cwd, home: r.home }
  const adopted = [...s.adopted.filter(p => p.at > s.turns - WINDOW && p.source !== r.source), { source: r.source, at: s.turns }]
  const kept = { ...s, goal: fresh, doneBoxes: r.boxes, adopted }
  if (s.goal && s.goal.spec === r.source)
    return isSameGoal(s.goal, fresh) ? kept : { ...kept, verdicts: [] }

  return { ...kept, edits: { inside: 0, outside: 0 }, verdicts: [] }
}

// With no paths named, an edit says nothing about scope.
function edit(s: State, file: string): State {
  const g = s.goal
  if (!g || g.paths.length === 0) return s
  const isInside = isInPlan(file, planFile(g)) || inside(file, g.paths)
  const { inside: n, outside: m } = s.edits

  return { ...s, edits: isInside ? { inside: n + 1, outside: m } : { inside: n, outside: m + 1 } }
}

const WEIGHT: Record<Judge, number | null> = { on: 1, partly: 0.5, off: 0, unknown: null }

// The turn's alignment: the mean of what is known of its edits' share in scope and the judge's verdict; null when neither is.
export function alignment(edits: Edits, judge: Judge): number | null {
  const known: number[] = []
  const all = edits.inside + edits.outside
  if (all > 0) known.push(edits.inside / all)
  const w = WEIGHT[judge]
  if (w !== null) known.push(w)

  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null
}

export const band = (a: number): Verdict => (a >= ON_TRACK ? 'on' : a >= SIDE_QUEST ? 'partly' : 'off')

const turnEnd = (s: State): State => ({ ...s, edits: { inside: 0, outside: 0 } })

// The goal in force: the plan, else the session's first substantive message, else none.
export const goalOf = (s: State): Goal | null => s.goal ?? (s.ask ? { thread: s.ask, spec: '', done: '', paths: [], cwd: '', home: '' } : null)

// The turn's rows always count toward health; its verdict counts only while the goal it was judged on is still the goal
// in force, the same source, goal and done, so a verdict on a plan re-read with a new goal is dropped.
// A turn nothing could be read from, with no fact of its own, changes nothing but whether the last read failed.
function turn(s: State, judged: Goal | null, edits: Edits, judge: Judge, rows: State['rows'], reading: Reading): State {
  const isUnread = reading === 'none' ? s.isUnread : reading === 'failed'
  if (reading !== 'read' && judge === 'unknown' && rows.every(isBlank)) return isUnread === s.isUnread ? s : { ...s, isUnread }
  const next = { ...s, turns: s.turns + 1, rows: [...s.rows, ...rows].slice(-WINDOW), isUnread }
  const a = alignment(edits, judge)
  if (!isSameGoal(goalOf(s), judged) || a === null) return next

  return { ...next, verdicts: [...s.verdicts, band(a)].slice(-RECENT) }
}

export function reduce(s: State, e: Event): State {
  switch (e.type) {
    case 'read':
      return read(s, e)
    case 'edit':
      return edit(s, e.path)
    case 'touch':
      return touch(s, e.path, e.mark)
    case 'ask':
      return s.ask ? s : { ...s, ask: flat(e.text) }
    case 'turnEnd':
      return turnEnd(s)
    case 'turn':
      return turn(s, e.goal, e.edits, e.judge, e.rows, e.reading)
  }
}

// The focus level from what the session shows: its plans in the last 5 turns, the goal and the last 3 judged turns.
// A clear goal is one plan whose done is written as checkboxes, its last 3 judged turns all on it.
// No plan and no first message, RECENT turns in: a pause of its own, not one of turns off track.
export const hasNoObjective = (s: State) => !s.goal && !s.ask && s.turns >= RECENT
// More than one plan read within the window: fragmented whatever the latest turn.
export const hasRivalPlans = (s: State) => recentPlans(s).size > 1

export function levelOf(s: State): Level {
  const latest = s.verdicts.at(-1)
  const isLost = s.verdicts.length >= RECENT && s.verdicts.every(v => v === 'off')
  if (isLost || hasNoObjective(s)) return 'pause'
  if (latest === 'off') return 'regroup'
  if (hasRivalPlans(s) || latest === 'partly') return 'fragmented'
  const isOnTrack = s.verdicts.length >= RECENT && s.verdicts.every(v => v === 'on')
  if (s.goal && s.doneBoxes > 0 && isOnTrack) return 'clear'

  return 'goals'
}

// The plan's short name: the last part of its file path or issue URL, or the source as it stands.
export const planName = (spec: string) => spec.replace(/\/+$/, '').split('/').pop() ?? spec

// The signal, and the score whose total is its health, from one reading of the state.
export function measure(s: State): { signal: Signal; score: Score } {
  const level = levelOf(s)
  const parts = score(s.rows, level)

  return { signal: { health: parts.total, level, plan: s.goal ? planName(s.goal.spec) : '' }, score: parts }
}

export const signal = (s: State): Signal => measure(s).signal
