// The places the session's plan files sit in, listed in the focus file.
import { expect, test } from 'claude-code/testing'

import { PLAN, planText, world, started, readFile, write } from '../tests/fixtures/focus-world'
import type { State } from '../types'

const placesWritten = (writes: { text: string }[]) => JSON.parse(writes.at(-1)!.text).places

test('each plan file the session writes, reads or names is listed by place, in the order first touched', async ($, on) => {
  const { clock, writes } = world(on, { cwd: '/r/.claude/worktrees/f', git: { top: '/r/.claude/worktrees/f', common: '/r/.git' } })
  await started($)
  await write($, '/r/.claude/worktrees/f/.sdlc/spec.md')
  await $.tool.call({ tool: 'Bash', command: 'cat .sdlc/tasks.md ../../../.claude/RESUME.md src/app.ts' } as never)
  await readFile($, '/home/w/.claude/plans/calm.md')
  await $.tool.call({ tool: 'Bash', command: 'cat .sdlc/spec.md' } as never)
  await clock.settle()

  expect(placesWritten(writes)).toEqual([
    { path: '/r/.claude/worktrees/f/.sdlc/spec.md', label: 'worktree .sdlc/', mark: 'w' },
    { path: '/r/.claude/worktrees/f/.sdlc/tasks.md', label: 'worktree .sdlc/', mark: 'b' },
    { path: '/r/.claude/RESUME.md', label: 'main RESUME.md', mark: 'b' },
    { path: '/home/w/.claude/plans/calm.md', label: 'plan', mark: 'r' },
  ])
})

test("a file read after it was named counts as read, and a subagent's calls are not the session's", async ($, on) => {
  const { clock, writes } = world(on)
  await started($)
  await $.tool.call({ tool: 'Bash', command: 'cat docs/plans/a.md' } as never)
  await readFile($, '/w/docs/plans/a.md')
  await write($, '/w/.sdlc/spec.md', 'agent-1')
  await clock.settle()

  expect(placesWritten(writes)).toEqual([{ path: '/w/docs/plans/a.md', label: 'w docs/plans/', mark: 'r' }])
})

test('the places survive a resume and /clear empties them', async ($, on) => {
  const { clock, writes } = world(on)
  await started($)
  await write($, '/w/.sdlc/spec.md')
  await $.session.end({ reason: 'prompt_input_exit' } as never)
  await $.session.start({ source: 'resume', cwd: '/w' } as never)
  await clock.settle()
  expect(placesWritten(writes)).toEqual([{ path: '/w/.sdlc/spec.md', label: 'w .sdlc/', mark: 'w' }])

  await $.session.end({ reason: 'clear' } as never)
  expect(placesWritten(writes)).toEqual([])
})

test('a write to a plan file, a touch and an edit both, saves the state once', async ($, on) => {
  const { clock, saves } = world(on, { files: { [PLAN]: planText(3, 6) }, isSaveCounted: true })
  await started($)
  await readFile($)
  await clock.settle()
  saves.length = 0
  await write($, '/w/.sdlc/notes.txt')
  await clock.settle()
  const states = saves.filter(s => s.key.startsWith('focusV1:')).map(s => (s.value as { state: State }).state)

  expect(states).toHaveLength(1)
  expect(states[0]!.touched).toContainEqual({ path: '/w/.sdlc/notes.txt', mark: 'w' })
  expect(states[0]!.edits).toEqual({ inside: 0, outside: 1 })
})
