import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A session whose id cannot be read, so the focus hook on every prompt fails.
function broken(on: any) {
  const logs: { text: string; to: string }[] = []
  mock.env(on, { HOME: '/home/w' })
  mock.store(on, {})
  on('session.id', () => {
    throw new Error('no session id')
  })
  on('prompt.submit', ($: any, e: any) => ({ text: e.text }))
  on('ui.log', ($: any, e: any) => {
    logs.push({ text: e.text, to: e.to })
    return { value: undefined }
  })
  return logs
}

const submit = ($: Engine, text: string) => $.prompt.submit({ text } as never)

test('a hook that fails says so in the transcript once, then in the debug log, and the prompt still goes through', async ($, on) => {
  const logs = broken(on)

  expect(await submit($, 'first')).toEqual({ text: 'first' })
  expect(await submit($, 'second')).toEqual({ text: 'second' })

  const failures = logs.filter(l => l.text.startsWith('ortonom: prompt.submit hook failed:'))
  expect(failures.map(l => l.to)).toEqual(['transcript', 'debug'])
  expect(failures[0]?.text).toContain('session.id')
})
