import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Event, State } from '../types'
import { focusFileOf, focusPath } from './focus-file'
import { consider, portOf, retryPending, type Candidate, type Land } from './plan-read'
import { placeOf, plansFolder, whereOf } from './places'
import { forget, isLive, memoryOf, type Memory } from './session-memory'
import { FAMILY, initial, loaded, reduce, signal, STATE_KEY } from './state'
import { KEEP_DAYS, stateFolder } from './state-folder'

const DAY = 86_400_000

// The session's focus state, which this module alone writes; the pane reads it. The key is a literal, as the engine's
// scan reads it as written, and carries the state shape's version.
const focusState = atom({ plugin: 'ortonom', key: 'focusV1' } as const, initial())
// The session whose state focusState holds; versioned with it, so a new shape never trusts an id held for the old one.
const heldFor = atom({ plugin: 'ortonom', key: 'focusForV1' } as const, '')

let queue: Promise<unknown> = Promise.resolve()
let homeDir = ''
// The folder the focus signal is written to, named once at session start; null when there is none.
let folder: string | null = null
// The plans folder of Claude Code's config, a place of its own on the plan row.
let plans = ''
let isSaveTold = false
let isWriteTold = false
// The path and text last written, joined, so an unchanged signal is not written again.
let lastWrite = ''

export const home = () => homeDir
export const plansDir = () => plans

async function key($: EngineInterface) {
  return `${STATE_KEY}${await $.session.id()}`
}

// A function declaration, as the engine follows $ across an import only into one; an arrow here drops its calls from
// the scan.
export async function memory($: EngineInterface) {
  return memoryOf(await $.session.id())
}

// The session's state, loaded from the store whenever the session id moves under the mod (a resume).
async function current($: EngineInterface): Promise<State> {
  const id = await $.session.id()
  if ((await read($, heldFor)) === id) return read($, focusState)
  // The old session's memory stops being live here, so a read or verdict still in flight for it is dropped.
  memoryOf(id)
  lastWrite = ''
  const stored = (await $.store.get(await key($))) as { state?: unknown } | undefined
  const state = loaded(stored?.state)
  await update($, focusState, () => state)
  await update($, heldFor, () => id)
  await publish($, state)

  return state
}

// One change at a time, so a read landing between a tool call's awaits can't drop either change.
function queued<T>(work: () => Promise<T>) {
  const run = queue.then(work)
  queue = run.catch(() => undefined)

  return run
}

// Names the folders the session writes and resolves against, then loads its state.
export async function open($: EngineInterface) {
  homeDir = (await $.env.get('HOME')) ?? ''
  folder = await stateFolder($)
  plans = plansFolder(await $.env.get('CLAUDE_CONFIG_DIR'), homeDir)
  await current($)
}

export function apply($: EngineInterface, events: Event[]) {
  return queued(() => applyNow($, events))
}

// The turn's edits as they stood when it ended, taken and cleared in one step of the queue.
export function seal($: EngineInterface) {
  return queued(async () => {
    const before = await current($)
    await applyNow($, [{ type: 'turnEnd' }])

    return before
  })
}

// A late result, a plan read or a verdict, lands inside the queue once the session is loaded, so one begun before
// /clear or a session switch finds its memory no longer live there and is dropped; pick runs only for a live one.
export function landIfLive($: EngineInterface, m: Memory, pick: () => Event | null) {
  return queued(async () => {
    await current($)
    if (!isLive(m)) return
    const event = pick()
    if (event) await applyNow($, [event])
  })
}

// The session's plan reads, bound to its memory's reads and landing through landIfLive, so a read begun under one
// memory can only land as that memory's.
export function plansOf($: EngineInterface, m: Memory) {
  const land: Land = pick => landIfLive($, m, pick)

  return {
    offer: (candidate: Candidate) => consider(portOf($), m.reads, candidate, land),
    retry: () => retryPending(portOf($), m.reads, land),
  }
}

// /clear: fresh memory under the same session, its stored state gone and the initial signal published, inside the
// queue so a change in flight can't write its signal over the cleared one.
export function clear($: EngineInterface) {
  return queued(async () => {
    forget()
    lastWrite = ''
    await $.store.delete(await key($))
    await update($, focusState, () => initial())
    await publish($, initial())
  })
}

async function applyNow($: EngineInterface, events: Event[]) {
  const before = await current($)
  let state = before
  for (const event of events) state = reduce(state, event)
  if (state !== before) {
    await update($, focusState, () => state)
    try {
      await $.store.set(await key($), { state, at: await $.clock.now() })
    } catch {
      if (!isSaveTold) $.ui.log('focus state not saved; it resets on resume')
      isSaveTold = true
    }
  }
  // An unchanged state still publishes, so a write that failed is tried again.
  await publish($, state)
}

export async function prune($: EngineInterface) {
  const now = await $.clock.now()
  const keys = (await $.store.keys()).filter(k => k.startsWith(FAMILY))
  await Promise.all(keys.map(async k => {
    const at = ((await $.store.get(k)) as { at?: number } | undefined)?.at ?? 0
    if (now - at > KEEP_DAYS * DAY) await $.store.delete(k)
  }))
}

async function publish($: EngineInterface, state: State) {
  if (!folder) return
  const where = state.touched.length ? await whereOf($, await $.session.cwd()) : { top: '', main: '' }
  const places = state.touched.flatMap(t => {
    const label = placeOf(t.path, plans, where)
    return label ? [{ path: t.path, label, mark: t.mark }] : []
  })
  const text = JSON.stringify(focusFileOf(signal(state), places, state.isUnread))
  const path = focusPath(folder, await $.session.id())
  const write = `${path}\n${text}`
  if (write === lastWrite) return
  try {
    await $.fs.write(path, `${text}\n`)
    lastWrite = write
  } catch {
    if (!isWriteTold) $.ui.log(`${path} not written; a status line reading it shows an older signal or none`)
    isWriteTold = true
  }
}
