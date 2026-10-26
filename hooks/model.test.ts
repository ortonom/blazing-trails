import { expect, test } from 'claude-code/testing'

import { ask } from './model'

test('a model call that throws is reported as what it threw', async ($, on) => {
  on('model.complete', () => {
    throw new Error('network down')
  })
  const reply = await ask($ as never, 'Judge this turn.', 'a turn', 10)

  expect('reason' in reply && reply.reason).toContain('model.complete')
})
