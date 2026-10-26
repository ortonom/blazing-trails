import type { EngineInterface } from 'claude-code'

import type { Mark } from '../types'
import { resolve } from './state'
import type { ToolCall } from './tool-call'

// Where a plan file can sit. A place with a label is a store, drawn by its label; one with a kind is in a checkout, its
// pattern's first group the checkout's root (or root, built from the groups), drawn as where that root is and the kind.
// {plans} is the plans folder of Claude Code's config.
type Place = { pattern: string; label?: string; kind?: string; root?: string }

const table: readonly Place[] = [
  { label: 'plan', pattern: '^{plans}(/|$)' },
  { label: 'gstack', pattern: '/\\.gstack/projects/' },
  { label: 'handoff', pattern: '/compound-engineering-[0-9][^/]*/ce-handoff/|/handoff-[0-9]+/' },
  { kind: '.oneshot/', pattern: '^(.*?)/\\.oneshot(/|$)' },
  { kind: '.sdlc/', pattern: '^(.*?)/\\.sdlc(/|\\.md$|$)' },
  { kind: '.scratch/', pattern: '^(.*?)/\\.scratch(/|$)' },
  { kind: 'docs/plans/', pattern: '^(.*?)/docs/plans(/|$)' },
  { kind: 'RESUME.md', pattern: '^(.*)/\\.claude/RESUME\\.md$' },
  { kind: 'opord.md', pattern: '^(.*)/\\.git/worktrees/([^/]+)/opord\\.md$', root: '$1/.claude/worktrees/$2' },
  { kind: 'opord.md', pattern: '^(.*)/\\.git/opord\\.md$' },
]

// Where the session runs: its checkout's root and the main checkout's, each '' outside a repo.
export type Where = { top: string; main: string }

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Each table's matchers, built once per plans folder: a command can name hundreds of paths, each tried on every place.
const built = new WeakMap<readonly Place[], Map<string, RegExp[]>>()
function matchers(places: readonly Place[], plans: string) {
  const byPlans = built.get(places) ?? new Map<string, RegExp[]>()
  built.set(places, byPlans)
  const found = byPlans.get(plans) ?? places.map(p => new RegExp(p.pattern.replace('{plans}', () => escaped(plans))))
  byPlans.set(plans, found)

  return found
}
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() ?? p

// Whether a path sits in a plan place, before it is known where the session's checkouts are.
export const isPlanPath = (path: string, plans: string, places: readonly Place[] = table) => matchers(places, plans).some(m => m.test(path))

// The label a path's place is drawn by: a store's label, or where its checkout is and the kind; null when it is in none.
export function placeOf(path: string, plans: string, where: Where, places: readonly Place[] = table): string | null {
  const all = matchers(places, plans)
  for (const [i, p] of places.entries()) {
    const m = path.match(all[i]!)
    if (!m) continue
    if (p.label) return p.label
    const root = p.root ? p.root.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '') : (m[1] ?? '')
    return `${locationOf(root, where)} ${p.kind}`
  }

  return null
}

// Where a checkout's root is: this worktree, main, another worktree of main, or another repo by name.
function locationOf(root: string, { top, main }: Where) {
  if (top && root === top) return top === main ? 'main' : 'worktree'
  if (main && root === main) return 'main'
  if (main && root.startsWith(`${main}/.claude/worktrees/`)) return 'other worktree'
  const at = root.indexOf('/.claude/worktrees/')

  return at >= 0 ? `${base(root.slice(0, at))} @${base(root)}` : base(root)
}

// The paths a shell command names, absolute: each word with no flag, glob, variable or escape in it, resolved against
// the folder the command ran in.
export const namedPaths = (command: string, cwd: string, home: string) =>
  command
    .split(/[\s"'`=(){}<>|;&,[\]]+/)
    .filter(w => w && !/^-|[$*\\!?]/.test(w))
    .map(w => resolve(w, cwd, home))

// The plan files a main-session call that went through touches: the file a tool writes (w) or reads (r), or each one a
// command names (b).
export function touchesOf({ mark, path, command }: ToolCall, cwd: string, home: string, plans: string): { path: string; mark: Mark }[] {
  if (!mark) return []
  const paths = mark === 'b' ? namedPaths(command, cwd, home) : path !== null ? [resolve(path, cwd, home)] : []

  return paths.filter(p => isPlanPath(p, plans)).map(p => ({ path: p, mark }))
}

// The plans folder of Claude Code's config, a place of its own.
export const plansFolder = (config: string | null | undefined, home: string) => `${config || `${home}/.claude`}/plans`

const wheres = new Map<string, Promise<Where>>()
const nowhere = (cwd: string): Where => {
  wheres.delete(cwd)
  return { top: '', main: '' }
}

// Where a folder's checkouts are, asked of git once per folder; nowhere when it is no repo or git cannot answer, and asked
// again on the next call.
export function whereOf($: EngineInterface, cwd: string) {
  let where = wheres.get(cwd)
  if (!where) {
    where = $.process.run(['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir']).then(
      ({ exitCode, stdout }) => {
        if (exitCode !== 0) return nowhere(cwd)
        const [top = '', common = ''] = stdout.trim().split('\n')
        return { top, main: common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : '' }
      },
      () => nowhere(cwd),
    )
    wheres.set(cwd, where)
  }

  return where
}
