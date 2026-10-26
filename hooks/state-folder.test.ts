import { expect, mock, test } from 'claude-code/testing'

// A session start whose processes are recorded, answered with `exitCode`.
function world(on: any, env: Record<string, string>, exitCode = 0, folders = ['/home/w/.claude/state']) {
  const runs: string[][] = []
  const logs: string[] = []
  mock.env(on, env)
  mock.store(on, {})
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('process.run', ($: any, e: any) => {
    runs.push([...e.argv])
    return { value: { exitCode, stdout: '', stderr: exitCode ? 'find: permission denied' : '' } }
  })
  on('fs.read', ($: any, e: any) => {
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.write', () => ({ value: undefined }))
  on('fs.stat', ($: any, e: any) => {
    if (folders.includes(e.path)) return { value: { kind: 'directory' } }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  on('command.list', () => ({ value: [] }))
  on('ui.log', ($: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/w' }))
  return { runs, logs, clock }
}

const prunes = (runs: string[][]) => runs.filter(r => r[0] === 'find')

test('at session start, state files untouched for 14 days are deleted from the state folder alone', async ($, on) => {
  const { runs, clock } = world(on, { HOME: '/home/w' })
  await $.session.start({ source: 'startup', cwd: '/w' } as never)
  await clock.settle()

  expect(prunes(runs)).toEqual([
    ['find', '/home/w/.claude/state', '-maxdepth', '1', '-type', 'f', '(', '-name', 'focus-*.json', '-o', '-name', 'agents-*', '-o', '-name', 'pr-*', '-o', '-name', 'worktrees-*', ')', '-mmin', '+20160', '-delete'],
  ])
})

test('with no state folder nothing is pruned', async ($, on) => {
  const none = world(on, {})
  await $.session.start({ source: 'startup', cwd: '/w' } as never)
  await none.clock.settle()
  expect(prunes(none.runs)).toEqual([])
})

test('a state folder not yet made is neither pruned nor reported', async ($, on) => {
  const { runs, logs, clock } = world(on, { HOME: '/home/w' }, 1, [])
  await $.session.start({ source: 'startup', cwd: '/w' } as never)
  await clock.settle()
  expect(prunes(runs)).toEqual([])
  expect(logs.filter(l => l.includes('pruning old state files'))).toEqual([])
})

test('a prune that fails says so', async ($, on) => {
  const { logs, clock } = world(on, { HOME: '/home/w' }, 1)
  await $.session.start({ source: 'startup', cwd: '/w' } as never)
  await clock.settle()

  expect(logs).toContain('ortonom: pruning old state files failed: find: permission denied')
})
