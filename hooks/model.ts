import type { EngineInterface } from 'claude-code'

import { reasonOf } from './failed'

const MODEL = 'haiku'

export type Reply = { text: string } | { reason: string }

const TOO_LONG: Reply = { reason: 'the model took too long' }
const NO_PROMPT: Reply = { reason: "the plugin's prompt file could not be read" }

// One haiku call on the person's account: its answer's text, or why there is none; past limitMs it is given up and aborted.
export async function ask($: EngineInterface, system: string, prompt: string, maxTokens: number, limitMs?: number): Promise<Reply> {
  if (!system) return NO_PROMPT
  const stop = new AbortController()
  // Started inside a promise, so a call that throws before it returns one is a refusal like any other.
  const call = Promise.resolve()
    .then(() => $.model.complete({ model: MODEL, system, prompt, maxTokens }, { signal: stop.signal }))
    .then(
      (reply): Reply => (reply.isAnswered ? { text: reply.text } : { reason: reply.reason }),
      (err): Reply => ({ reason: reasonOf(err) }),
    )
  if (!limitMs) return call
  // Raced on the session's clock rather than left to the abort, since an aborted call is not sure to settle.
  let timer: { cancel: () => void } | undefined
  const late = new Promise<Reply>(done => {
    timer = $.clock.after(limitMs, () => {
      stop.abort()
      done(TOO_LONG)
    })
  })
  try {
    return await Promise.race([call, late])
  } finally {
    timer?.cancel()
  }
}

const prompts = new Map<string, Promise<string>>()

// A prompt file of the plugin's, read once; empty when it cannot be read, and read again on the next call.
export function promptFile($: EngineInterface, name: string) {
  let text = prompts.get(name)
  if (!text) {
    text = $.fs.read(`${$.plugin.root}/${name}`).then(String, () => {
      prompts.delete(name)
      return ''
    })
    prompts.set(name, text)
  }

  return text
}

// The first JSON object in a model's reply, or null when there is none or it doesn't parse.
export function jsonIn(text: string): Record<string, unknown> | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
