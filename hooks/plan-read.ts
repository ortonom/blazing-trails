import type { EngineInterface } from 'claude-code'

import type { Answer, Count, Read } from '../types'
import { reasonOf } from './failed'
import { ask, jsonIn, MODEL } from './model'
import { PLAN_READ_PROMPT } from './prompts'
import { READ_KEY, resolve } from './state'
import { readText } from './files'
import type { Offer } from './tool-call'

const MOST = 30_000
// A plan read that fails this many times for one text stops being retried.
const TRIES = 4
// The temp folders, a session's scratchpad and a background job's among them: a file there is a draft, never a plan.
const TEMP = /^(\/private)?\/(tmp|var\/folders)\/|\/\.claude\/jobs\/[^/]+\/tmp\//

export type Candidate = { source: string; text: string; cwd: string; home: string }

// A session's plan reads: each candidate takes the next number, and a read lands only when it is newer than the last
// plan applied and than the newest read of its source, so an older read of a document never lands over a newer one.
export type PlanReads = {
  latest: number
  applied: number
  newest: Map<string, number>
  pending: Map<string, Candidate & { n: number }>
  tries: Map<string, number>
}

export const freshReads = (): PlanReads => ({ latest: 0, applied: 0, newest: new Map(), pending: new Map(), tries: new Map() })

// Lands a read: runs `pick` where reads are applied in order, and applies the read it returns; pick returns null for a
// read that lands too late.
export type Land = (pick: () => Read | null) => Promise<void>

// What the plan read takes from the engine: a file's text, the model's read of a text, the read cache, the next tick
// and the log.
export type Port = {
  file: (path: string) => Promise<string | null>
  read: (text: string) => Promise<Answer | { reason: string }>
  cached: (key: string) => Promise<Answer | undefined>
  cache: (key: string, answer: Answer) => Promise<void>
  later: (work: () => void) => void
  log: (text: string) => void
}

export function portOf($: EngineInterface): Port {
  return {
    file: path => readText($, path),
    read: text => readPlan($, text),
    cached: async key => ((await $.store.get(`${READ_KEY}${key}`)) as { answer?: Answer } | undefined)?.answer,
    cache: async (key, answer) => {
      await $.store.set(`${READ_KEY}${key}`, { answer, at: await $.clock.now() }).catch(() => undefined)
    },
    later: work => $.clock.after(0, work),
    log: text => $.ui.log(text),
  }
}

// One read of a text as a plan: whether it is one, its goal, its done, its done boxes and the paths it names, or why
// the read found nothing.
async function readPlan($: EngineInterface, text: string): Promise<Answer | { reason: string }> {
  const reply = await ask($, PLAN_READ_PROMPT, text, 1500)
  if ('reason' in reply) return reply

  return parseAnswer(reply.text) ?? { reason: 'its answer was not the JSON asked for' }
}

// The plan read, as JSON the model wrote: a malformed answer, or one of the wrong shape, is no answer.
export function parseAnswer(text: string): Answer | null {
  const a = jsonIn(text) as Partial<Answer> | null
  if (!a) return null
  if (typeof a.isPlan !== 'boolean' || typeof a.goal !== 'string' || typeof a.done !== 'string' || !Array.isArray(a.paths)) return null

  const doneBoxes = typeof a.doneBoxes === 'number' && a.doneBoxes >= 0 ? Math.floor(a.doneBoxes) : undefined

  return { isPlan: a.isPlan, goal: a.goal, done: a.done, paths: a.paths.filter((p): p is string => typeof p === 'string'), ...(doneBoxes === undefined ? {} : { doneBoxes }) }
}

// A checkbox on a list line: its list marker, then the box's mark.
const BOX = /^(\s*[-*+]\s+)\[([ xX])\]/

export function countBoxes(text: string): Count {
  const boxes = text.split('\n').flatMap(line => line.match(BOX)?.[2] ?? [])

  return { ticked: boxes.filter(b => b !== ' ').length, total: boxes.length }
}

// A text's identity for the read cache: the model and prompt that read it, and the text with every box unticked so ticking
// one doesn't make it a new plan. A changed prompt or model is a new key, so each plan is read again.
export const textKey = (text: string, prompt = PLAN_READ_PROMPT, model = MODEL) =>
  hash([model, prompt, text.replace(new RegExp(BOX.source, 'gm'), '$1[ ]')].join('\0'))

// cyrb53: a fast 53-bit string hash, synchronous so the cache key needs no await.
function hash(s: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// A folder of task files is one plan: a file in a tasks folder is that folder's, and a file in a folder under
// plans/, specs/ or tasks/ is that folder's; a file directly in plans/ or specs/ is its own plan.
function folderPlan(path: string) {
  const nested = path.match(/^(.*\/(?:plans|specs|tasks)\/[^/]+)\/.+\.md$/)
  if (nested) return nested[1]!
  const tasks = path.match(/^(.*\/tasks)\/[^/]+\.md$/)

  return tasks ? tasks[1]! : null
}

// What a finished tool call offers as a plan: ExitPlanMode's plan, a markdown file outside a temp folder with boxes or
// under plans/, specs/ or tasks/, or what `gh issue view` printed.
export async function offered(port: Port, offer: Offer, result: unknown, cwd: string, home: string) {
  const at = (source: string, text: string | null): Candidate | null => (text?.trim() ? { source, text, cwd, home } : null)
  if (offer.kind === 'plan mode') {
    const out = (result ?? {}) as { plan?: unknown; filePath?: unknown }
    const file = typeof out.filePath === 'string' ? out.filePath : null

    return at(file ?? 'plan mode', typeof out.plan === 'string' ? out.plan : file && (await port.file(file)))
  }
  if (offer.kind === 'file') {
    const path = resolve(offer.path, cwd, home)
    if (TEMP.test(path)) return null
    const text = await port.file(path)
    const isListed = !!text && (countBoxes(text).total > 0 || /\/(plans|specs|tasks)\//.test(path))

    return isListed ? at(folderPlan(path) ?? path, text) : null
  }
  const out = (result ?? {}) as { stdout?: unknown }

  return at(offer.issue, typeof out.stdout === 'string' ? out.stdout : null)
}

// A candidate read, or taken from the cache when its text was read before, then landed. A hit is written back, which
// renews the entry's `at`, so prune drops the entries nobody uses and keeps the ones in use.
export async function consider(port: Port, reads: PlanReads, offer: Candidate, land: Land) {
  const c = { ...offer, text: offer.text.slice(0, MOST) }
  const key = textKey(c.text)
  if ((reads.tries.get(key) ?? 0) >= TRIES) return
  const n = ++reads.latest
  const cached = await port.cached(key)
  if (cached) {
    await port.cache(key, cached)
    return landed(reads, n, c, cached, land)
  }
  port.later(() => attempt(port, reads, n, c, land).catch(err => untried(port, reads, c, err)))
}

// The reads that failed, tried again: called at a turn's end.
export function retryPending(port: Port, reads: PlanReads, land: Land) {
  for (const c of [...reads.pending.values()]) {
    if (c.n <= reads.applied) reads.pending.delete(c.source)
    else port.later(() => attempt(port, reads, c.n, c, land).catch(err => untried(port, reads, c, err)))
  }
}

// A read that threw leaves the pending reads, and is said once.
function untried(port: Port, reads: PlanReads, c: Candidate, err: unknown) {
  reads.pending.delete(c.source)
  port.log(`reading ${c.source} as a plan failed: ${reasonOf(err)}`)
}

// One plan read of a candidate: a failed one waits for the turn's end to be tried again, at most TRIES times a text.
async function attempt(port: Port, reads: PlanReads, n: number, c: Candidate, land: Land) {
  const answer = await port.read(c.text)
  if ('reason' in answer) {
    const k = textKey(c.text)
    const tried = (reads.tries.get(k) ?? 0) + 1
    reads.tries.set(k, tried)
    if (tried >= TRIES) {
      reads.pending.delete(c.source)
      port.log(`couldn't read ${c.source} after ${tried} tries: ${answer.reason}`)
      return
    }
    if (!reads.pending.has(c.source)) port.log(`couldn't read ${c.source}: ${answer.reason}; retrying`)
    reads.pending.set(c.source, { ...c, n })

    return
  }
  reads.tries.delete(textKey(c.text))
  await port.cache(textKey(c.text), answer)
  await landed(reads, n, c, answer, land)
}

function landed(reads: PlanReads, n: number, c: Candidate, answer: Answer, land: Land) {
  reads.pending.delete(c.source)

  return land(() => {
    if (n <= reads.applied || n < (reads.newest.get(c.source) ?? 0)) return null
    reads.newest.set(c.source, n)
    // A document that is no plan, or one with no done line, holds no place against an older read; it only clears itself if active.
    const isReady = answer.isPlan && !!answer.done.trim()
    if (isReady) reads.applied = n

    return { type: 'read', source: c.source, goal: answer.goal, done: isReady ? answer.done : '', paths: answer.paths, boxes: answer.doneBoxes ?? countBoxes(c.text).total, cwd: c.cwd, home: c.home }
  })
}
