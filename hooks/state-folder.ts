import type { EngineInterface } from 'claude-code'

import { focusFolder } from './focus-file'

export const KEEP_DAYS = 14

// The state folder the status line and the plugin share, from the session's environment; null when there is none.
export async function stateFolder($: EngineInterface) {
  return focusFolder({
    STATUSLINE_STATE: await $.env.get('STATUSLINE_STATE'),
    CLAUDE_CONFIG_DIR: await $.env.get('CLAUDE_CONFIG_DIR'),
    HOME: await $.env.get('HOME'),
  })
}

// The state files no session has touched for KEEP_DAYS days: focus files, PR caches and worktree marks.
// A hook has no file delete, so find removes them; a folder not yet made has nothing to prune.
export async function pruneStateFiles($: EngineInterface) {
  const folder = await stateFolder($)
  if (!folder || !(await $.fs.stat(folder).then(() => true, () => false))) return
  const names = ['focus-*.json', 'pr-*', 'worktrees-*'].flatMap((n, i) => (i ? ['-o', '-name', n] : ['-name', n]))
  // -mmin, as -mtime +14 counts whole days and keeps a file until its 15th.
  const run = await $.process.run(['find', folder, '-maxdepth', '1', '-type', 'f', '(', ...names, ')', '-mmin', `+${KEEP_DAYS * 24 * 60}`, '-delete'])
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `find exited ${run.exitCode}`)
}
