import { expect, test } from 'claude-code/testing'

import { isPlanPath, namedPaths, placeOf, plansFolder, touchesOf } from './places'
import { callOf } from './tool-call'

const PLANS = '/home/w/.claude/plans'
const inWorktree = { top: '/r/.claude/worktrees/f', main: '/r' }
const at = (path: string, where = inWorktree) => placeOf(path, PLANS, where)

test('a file in a checkout is drawn as where its checkout is and the kind of place', () => {
  expect(at('/r/.claude/worktrees/f/.sdlc/spec.md')).toBe('worktree .sdlc/')
  expect(at('/r/.claude/RESUME.md')).toBe('main RESUME.md')
  expect(at('/r/.claude/worktrees/g/docs/plans/a.md')).toBe('other worktree docs/plans/')
  expect(at('/o/.claude/worktrees/h/.scratch/m.md')).toBe('o @h .scratch/')
  expect(at('/q/.sdlc.md')).toBe('q .sdlc/')
  expect(at('/r/.oneshot/intent.md', { top: '/r', main: '/r' })).toBe('main .oneshot/')
})

test("opord.md in a worktree's git folder is that worktree's", () => {
  expect(at('/r/.git/worktrees/f/opord.md')).toBe('worktree opord.md')
  expect(at('/r/.git/opord.md')).toBe('main opord.md')
})

test('a store is drawn by its name', () => {
  expect(at(`${PLANS}/calm-river.md`)).toBe('plan')
  expect(at('/tmp/compound-engineering-501/ce-handoff/repo-1/next.md')).toBe('handoff')
  expect(at('/tmp/handoff-501/next.md')).toBe('handoff')
  expect(at('/home/w/.gstack/projects/app/plan.md')).toBe('gstack')
})

test("a file in no plan place is none, and a handoff skill's own files are no handoff", () => {
  expect(at('/r/src/app.ts')).toBe(null)
  expect(at('/home/w/.claude/skills/ce-handoff/references/resume.md')).toBe(null)
  expect(isPlanPath('/r/src/app.ts', PLANS)).toBe(false)
  expect(isPlanPath('/r/.sdlc/spec.md', PLANS)).toBe(true)
})

test('outside a repo a checkout is named by its folder', () => {
  expect(at('/w/docs/plans/p.md', { top: '', main: '' })).toBe('w docs/plans/')
})

test("a command's paths resolve against its folder, and a flag, glob or variable is no path", () => {
  expect(namedPaths('cat .sdlc/tasks.md ./.sdlc/a.md ../w/.sdlc/b.md ~/x.md', '/w', '/home/w')).toEqual([
    '/w/cat',
    '/w/.sdlc/tasks.md',
    '/w/.sdlc/a.md',
    '/w/.sdlc/b.md',
    '/home/w/x.md',
  ])
  expect(namedPaths('ls -la *.md $HOME/.sdlc "a b"', '/w', '/home/w')).toEqual(['/w/ls', '/w/a', '/w/b'])
})

test('a plan file a tool writes is marked w, one it reads r, and each one a command names b', () => {
  const touched = (tool: string, input: Record<string, unknown>) => touchesOf(callOf(tool, input), '/w', '/home/w', PLANS)

  for (const tool of ['Write', 'Edit', 'MultiEdit']) expect(touched(tool, { file_path: 'docs/plans/a.md' })).toEqual([{ path: '/w/docs/plans/a.md', mark: 'w' }])
  expect(touched('NotebookEdit', { notebook_path: '/w/.sdlc/n.ipynb' })).toEqual([{ path: '/w/.sdlc/n.ipynb', mark: 'w' }])
  expect(touched('Read', { file_path: `${PLANS}/calm.md` })).toEqual([{ path: `${PLANS}/calm.md`, mark: 'r' }])
  expect(touched('Bash', { command: 'cat .sdlc/spec.md src/app.ts' })).toEqual([{ path: '/w/.sdlc/spec.md', mark: 'b' }])
})

test('a file in no plan place, a notebook only read, and any other tool touch nothing', () => {
  const touched = (tool: string, input: Record<string, unknown>) => touchesOf(callOf(tool, input), '/w', '/home/w', PLANS)

  expect(touched('Write', { file_path: '/w/src/app.ts' })).toEqual([])
  expect(touched('Read', { notebook_path: '/w/.sdlc/n.ipynb' })).toEqual([])
  expect(touched('Glob', { pattern: '.sdlc/*.md' })).toEqual([])
})

test("the plans folder is CLAUDE_CONFIG_DIR's, else ~/.claude's", () => {
  expect(plansFolder('/c', '/h')).toBe('/c/plans')
  expect(plansFolder('', '/h')).toBe('/h/.claude/plans')
  expect(plansFolder(undefined, '/h')).toBe('/h/.claude/plans')
})

test('a plans folder whose name holds regex characters matches only itself, on every call', () => {
  const plans = '/home/w (1)/$&.claude/plans+'
  const where = { top: '', main: '' }

  for (let i = 0; i < 2; i++) {
    expect(isPlanPath(`${plans}/calm.md`, plans)).toBe(true)
    expect(placeOf(`${plans}/calm.md`, plans, where)).toBe('plan')
    expect(isPlanPath('/home/w 1/$&.claude/plansss/calm.md', plans)).toBe(false)
  }
  expect(isPlanPath(`${PLANS}/calm.md`, PLANS)).toBe(true)
})
