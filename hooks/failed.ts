import type { EngineInterface, HookFailure } from 'claude-code'

const told = new Set<string>()

// Why something failed, as one line: a hook failure's kind and message, an error's message, or the value as text.
export const reasonOf = (why: unknown) => {
  if (why && typeof why === 'object' && 'kind' in why && 'budget' in why) {
    const f = why as HookFailure
    return f.message ? `${f.kind}: ${f.message}` : f.kind
  }
  return why instanceof Error ? why.message : String(why)
}

// A failure the plugin carries on past: the transcript says so once per place while the plugin is loaded, the debug log
// every time. It never throws, so a catch that calls it still hands the event on.
export function failed($: EngineInterface, where: string, why: unknown) {
  try {
    $.ui.log(`ortonom: ${where} failed: ${reasonOf(why)}`, told.has(where) ? { to: 'debug' } : undefined)
  } catch {}
  told.add(where)
}
