import { freshReads, type PlanReads } from './plan-read'
import type { Call } from './scorecard'
import { EARLIER } from './turn-judge'

// What the person said and asked in the turn in flight. A switch to another session can come between a prompt and the
// end of its turn, so a switch carries this over; /clear does not.
type Turn = {
  lastPrompt: string
  // Prompts typed while a turn runs, which are the person's latest message only once that turn ends.
  typedAhead: string[]
  // Skills the main session started this turn, by name, and the plan source of the one this turn ran.
  asked: Set<string>
  skillRun: string
}

// One session's memory beside its state. /clear and a switch to another session replace it, so a read or verdict begun
// under the old one finds it no longer live and is dropped.
export type Memory = {
  reads: PlanReads
  // The main session's tool calls this turn, and the person's messages before the previous one, for the turn's row of facts.
  calls: Call[]
  earlier: string[]
  priorPrompt: string
  turn: Turn
  // Verdicts land in the order their turns ended, since each one's weight depends on those before it.
  verdicts: Promise<unknown>
}

const freshTurn = (): Turn => ({ lastPrompt: '', typedAhead: [], asked: new Set(), skillRun: '' })

const fresh = (turn = freshTurn()): Memory => ({
  reads: freshReads(),
  calls: [],
  earlier: [],
  priorPrompt: '',
  turn,
  verdicts: Promise.resolve(),
})

let held: { id: string; memory: Memory } | null = null

// The memory of session `id`; any other id than the last one asked for starts fresh memory in its place, with the turn
// in flight carried over.
export function memoryOf(id: string): Memory {
  if (held?.id !== id) held = { id, memory: fresh(held?.memory.turn) }

  return held.memory
}

export const isLive = (m: Memory) => held?.memory === m

// Fresh memory under the same session id, the turn in flight included, for /clear.
export function forget() {
  if (held) held = { id: held.id, memory: fresh() }
}

// A message of the person's: the turn's latest, or, typed while the turn runs, the next turn's.
export function heard(m: Memory, said: string, isTypedAhead: boolean) {
  if (isTypedAhead) m.turn.typedAhead.push(said)
  else m.turn.lastPrompt = said
}

// A skill the main session started this turn, by the name it was asked for.
export function asked(m: Memory, name: string) {
  m.turn.asked.add(name)
}

export function called(m: Memory, call: Call) {
  m.calls.push(call)
}

// The plan source of a skill whose prompt arrives, when the main session asked for it this turn, by either its bare or
// its namespaced name; null for a skill a subagent loads or one already started.
export function skillStarted(m: Memory, name: string): string | null {
  const match = [...m.turn.asked].find(a => a === name || a.endsWith(`:${name}`) || name.endsWith(`:${a}`))
  if (match === undefined) return null
  m.turn.asked.delete(match)
  m.turn.skillRun = `skill:${name}`

  return m.turn.skillRun
}

// A turn as it ended: its message, the one before, the earlier ones, its calls and the skill it ran. Its message then
// becomes the one before and prompts typed during it the next latest; a turn with no new message (a task notification)
// leaves the messages where they stood.
export function endTurn(m: Memory) {
  const ended = { said: m.turn.lastPrompt, prior: m.priorPrompt, earlier: [...m.earlier], made: m.calls, ranSkill: m.turn.skillRun }
  m.calls = []
  m.turn.asked.clear()
  m.turn.skillRun = ''
  if (m.turn.lastPrompt) {
    if (m.priorPrompt) m.earlier = [...m.earlier, m.priorPrompt].slice(-EARLIER)
    m.priorPrompt = m.turn.lastPrompt
  }
  m.turn.lastPrompt = m.turn.typedAhead.join('\n')
  m.turn.typedAhead = []

  return ended
}

// Runs work once every verdict queued before it has landed.
export function inTurnOrder(m: Memory, work: () => Promise<unknown>) {
  m.verdicts = m.verdicts.then(work).catch(() => undefined)
}
