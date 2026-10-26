import type { Register } from 'claude-code'

import { companionsStart, registerCompanions } from './companions'
import { focusStart, registerFocus } from './focus'
import { failed } from './failed'
import { registerSidebar, sidebarStart } from './sidebar'
import { pruneStateFiles } from './state-folder'
import { registerWorktrees } from './worktrees'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await focusStart($, e.isInteractive !== false).catch(err => failed($, 'focus start', err))
    await companionsStart($)
    await sidebarStart($)
    $.clock.after(0, () => pruneStateFiles($).catch(err => failed($, 'pruning old state files', err)))

    return next(e)
  }).catch(($, e, next) => (failed($, 'session.start hook', next.error), next(e)))

  registerSidebar(on)
  registerFocus(on)
  registerWorktrees(on)
  registerCompanions(on)
}
