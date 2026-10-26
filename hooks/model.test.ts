import { expect, test } from 'claude-code/testing'

import { ask } from './model'

test('a model call that throws is reported as what it threw', async ($, on) => {
  on('model.complete', () => {
    throw new Error('network down')
  })
  const reply = await ask($ as never, 'Judge this turn.', 'a turn', 10)

  expect('reason' in reply && reply.reason).toContain('model.complete')
})

test('an empty system prompt is refused before any model call', async ($, on) => {
  let calls = 0
  on('model.complete', () => {
    calls++
    return { value: { isAnswered: true as const, text: '{}', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }
  })

  expect(await ask($ as never, '', 'a turn', 10)).toEqual({ reason: "the plugin's prompt file could not be read" })
  expect(calls).toBe(0)
})
