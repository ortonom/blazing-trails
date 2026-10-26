import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A session whose EnterWorktree answers with `result`, or errors, and whose state folder is in memory.
function world(on: any, result: unknown, isError = false) {
  const files: Record<string, string> = {}
  mock.env(on, { HOME: '/home/w' })
  mock.store(on, {})
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w/.claude/worktrees/from-cwd' }))
  on('fs.read', ($: any, e: any) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.write', ($: any, e: any) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', { tool: 'EnterWorktree' }, () => (isError ? { result: 'no such repo', isError: true } : { result }))
  return files
}

const enter = ($: Engine) => $.tool.call({ tool: 'EnterWorktree', name: 'a' } as never)
const FILE = '/home/w/.claude/state/worktrees-s1'

test('each worktree the session enters is marked once, by the path the tool reports', async ($, on) => {
  const files = world(on, { worktreePath: '/w/.claude/worktrees/a' })
  await enter($)
  await enter($)

  expect(files[FILE]).toBe('/w/.claude/worktrees/a\n')
})

test('with no path reported, the folder the session stands in after the call is marked', async ($, on) => {
  const files = world(on, 'Created worktree')
  await enter($)

  expect(files[FILE]).toBe('/w/.claude/worktrees/from-cwd\n')
})

test('a worktree the tool could not enter is not marked', async ($, on) => {
  const files = world(on, null, true)
  await enter($)

  expect(files[FILE]).toBeUndefined()
})
