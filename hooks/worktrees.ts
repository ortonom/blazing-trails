import type { EngineInterface, On } from 'claude-code'

import { failed } from './failed'
import { readText } from './files'
import { stateFolder } from './state-folder'

// The session's worktrees, one path a line in worktrees-<session id> in the state folder, which the status line draws
// as rows of its worktree panel.
export async function markWorktree($: EngineInterface, path: string) {
  const folder = await stateFolder($)
  if (!folder || !path) return
  const file = `${folder}/worktrees-${await $.session.id()}`
  const lines = ((await readText($, file)) ?? '').split('\n').filter(Boolean)
  if (lines.includes(path)) return
  await $.fs.write(file, [...lines, path].join('\n') + '\n')
}

// Each worktree the session enters is marked: the path the tool reports, else the folder the session stands in after it.
export function registerWorktrees(on: On) {
  on('tool.call', { tool: 'EnterWorktree' }, async ($, e, next) => {
    const ran = await next(e)
    if ('deny' in ran || ran.isError) return ran
    const reported = (ran.result as { worktreePath?: unknown } | undefined)?.worktreePath
    // A mark that fails is reported here, so the hook's catch never runs the tool a second time.
    await markWorktree($, typeof reported === 'string' ? reported : await $.session.cwd()).catch(err => failed($, 'marking a worktree', err))

    return ran
  }).catch(($, e, next) => (failed($, 'EnterWorktree hook', next.error), next(e)))
}
