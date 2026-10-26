// The world the focus hook's tests run in: the engine's answers held in memory, a model that reads plans and
// judges turns as each test tells it, and the steps a session takes.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { FOCUS_READ_PROMPT } from '../../hooks/prompts'
import type { Answer, Judge } from '../../types'

// after: how many milliseconds of the mocked clock the judge takes to answer.
export type Verdict = Judge | { focus: Judge; userCorrection?: boolean; userRepeat?: boolean; after?: number }

export const PLAN = '/w/docs/plans/p.md'
export const PLAN_MODE = '/home/w/.claude/plans/quiet-plan.md'
export const boxes = (ticked: number, total: number) =>
  Array.from({ length: total }, (_, i) => `- [${i < ticked ? 'x' : ' '}] step ${i + 1}`).join('\n')
export const planText = (ticked: number, total: number, paths = 'mods/hq', goal = 'g', done = 'tests pass') =>
  `# ${goal}\nPaths: ${paths}\nDone: ${done}\n\n${boxes(ticked, total)}`

export type Reply = { isAnswered: true; text: string } | { isAnswered: false; reason: string } | 'reject'
// The model in these tests: a document is a plan unless it is a README; its goal is its first heading, its done its Done line,
// its paths its Paths line.
export const reader = (prompt: string): Answer => ({
  isPlan: !/^# README/m.test(prompt),
  goal: prompt.match(/^# (.+)$/m)?.[1] ?? '',
  done: prompt.match(/^Done: (.*)$/m)?.[1] ?? '',
  paths: (prompt.match(/^Paths: (.*)$/m)?.[1] ?? '').split(',').map(p => p.trim()).filter(Boolean),
})

export type World = {
  files?: Record<string, string>
  issues?: Record<string, string>
  stored?: Record<string, unknown>
  replies?: Reply[]
  // How many milliseconds of the mocked clock each plan read takes to answer, in the order they are asked.
  readDelays?: number[]
  isStoreBroken?: boolean
  // Keeps the store by hand, recording each save's key and value in `saves`.
  isSaveCounted?: boolean
  // 'hang': the judge never answers; 'unanswered': the call ends with no answer; raw: the judge's reply as written.
  verdicts?: (Verdict | 'reject' | 'hang' | 'unanswered' | { raw: string })[]
  env?: Record<string, string>
  failWrites?: number
  // What git says of the session's folder: its checkout's root and common dir; no repo when left out.
  git?: { top: string; common: string }
  cwd?: string
}

export function world(
  on: any,
  { files = {}, issues = {}, stored = {}, replies = [], readDelays = [], isStoreBroken = false, isSaveCounted = false, verdicts = [], env = {}, failWrites = 0, git, cwd = '/w' }: World = {},
) {
  const asked: string[] = []
  const judged: string[] = []
  const logs: string[] = []
  const writes: { path: string; text: string }[] = []
  const systems: string[] = []
  const saves: { key: string; value: unknown }[] = []
  let failsLeft = failWrites
  mock.env(on, { HOME: '/home/w', ...env })
  on('fs.write', ($: any, e: any) => {
    if (failsLeft-- > 0) throw new Error(`EACCES: ${e.path}`)
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  if (isStoreBroken) {
    const kept: Record<string, unknown> = {}
    on('store.get', ($: any, e: any) => ({ value: kept[e.key] }))
    on('store.keys', () => ({ value: Object.keys(kept) }))
    on('store.set', () => {
      throw new Error('store full')
    })
  } else if (isSaveCounted) {
    const kept: Record<string, unknown> = { ...stored }
    on('store.get', ($: any, e: any) => ({ value: kept[e.key] }))
    on('store.keys', () => ({ value: Object.keys(kept) }))
    on('store.set', ($: any, e: any) => {
      saves.push({ key: e.key, value: e.value })
      kept[e.key] = e.value
      return { value: undefined }
    })
    on('store.delete', ($: any, e: any) => {
      delete kept[e.key]
      return { value: undefined }
    })
  } else mock.store(on, stored)
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  on('session.start', () => ({ cwd: '/w' }))
  const session = { id: 's1' }
  on('session.id', () => ({ value: session.id }))
  on('session.cwd', () => ({ value: cwd }))
  // The session-start prune runs find; every other process is git, asked where a folder's checkouts are.
  on('process.run', ($: any, e: any) => ({
    value:
      e.argv[0] === 'find'
        ? { exitCode: 0, stdout: '', stderr: '' }
        : git
          ? { exitCode: 0, stdout: `${git.top}\n${git.common}\n`, stderr: '' }
          : { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
  }))
  // A read of anything but the test's files fails, the plugin's own folder among it.
  on('fs.read', ($: any, e: any) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('model.complete', async ($: any, e: any) => {
    systems.push(e.system)
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    if (e.system === FOCUS_READ_PROMPT) {
      judged.push(e.prompt)
      const verdict = verdicts.shift() ?? 'unknown'
      if (verdict === 'reject') throw new Error('model blocked')
      if (verdict === 'hang') return new Promise(() => {})
      if (verdict === 'unanswered') return { value: { isAnswered: false, reason: 'aborted', usage } }
      if (typeof verdict === 'object' && 'raw' in verdict) return { value: { isAnswered: true, text: verdict.raw, usage } }
      const { after = 0, ...read } = typeof verdict === 'string' ? { focus: verdict } : verdict
      if (after) await clock.sleep(after)
      return { value: { isAnswered: true, text: JSON.stringify({ userCorrection: false, userRepeat: false, ...read }), usage } }
    }
    asked.push(e.prompt)
    const after = readDelays.shift() ?? 0
    const reply = replies.shift() ?? { isAnswered: true, text: JSON.stringify(reader(e.prompt)) }
    if (after) await clock.sleep(after)
    if (reply === 'reject') throw new Error('model blocked')
    return { value: { ...reply, usage } }
  })
  on('ui.log', ($: any, e: any) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($: any, e: any) => ({ text: e.text }))
  on('skill.prompt', ($: any, e: any) => ({ text: e.text }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: 'loaded' }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  // A path naming denied is refused by the person; one naming failing errors.
  for (const tool of ['Write', 'Edit', 'Read'])
    on('tool.call', { tool }, ($: any, e: any) =>
      /denied/.test(e.file_path) ? { deny: 'no' } : /failing/.test(e.file_path) ? { result: 'EACCES', isError: true } : { result: 'ok' },
    )
  on('tool.call', { tool: 'ExitPlanMode' }, () => ({ result: { plan: files[PLAN_MODE] ?? '', filePath: PLAN_MODE, isAgent: false } }))
  on('tool.call', { tool: 'Bash' }, ($: any, e: any) => {
    const issue = e.command.match(/gh issue view (\d+)/)?.[1]
    return { result: { stdout: issue ? `title:\tissue ${issue}\n--\n${issues[issue] ?? ''}` : '' } }
  })

  return { files, asked, judged, logs, clock, writes, systems, saves, session }
}

export const started = ($: Engine) => $.session.start({ source: 'startup', cwd: '/w' } as never)
export const ended = ($: Engine, answer = '') => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
export const say = ($: Engine, text: string) => $.prompt.submit({ text } as never)
export const readFile = ($: Engine, path = PLAN) => $.tool.call({ tool: 'Read', file_path: path } as never)
export const write = ($: Engine, path: string, agentId?: string) =>
  $.tool.call({ tool: 'Write', file_path: path, content: '', ...(agentId ? { agentId } : {}) } as never)

// A session whose plan, PLAN with a done line, six boxes and the scope mods/hq, has been read.
export async function onPlan($: Engine, on: any, more: World = {}) {
  const w = world(on, { ...more, files: { [PLAN]: planText(3, 6), ...more.files } })
  await started($)
  await readFile($)
  await w.clock.settle()

  return w
}

// One completed turn whose judge has answered.
export const turnDone = async ($: Engine, clock: { settle: () => Promise<unknown> }) => {
  await ended($)
  await clock.settle()
}

export const FILE = '/home/w/.claude/state/focus-s1.json'
// The signal the last write carries, without the rows drawn from it.
export const lastWritten = (writes: { text: string }[]) => {
  const file = JSON.parse(writes.at(-1)?.text ?? 'null')
  return file && { health: file.health, level: file.level, plan: file.plan }
}
// The HP row the last write carries, as the status line draws it.
export const hpRow = (writes: { text: string }[]) => (JSON.parse(writes.at(-1)!.text).rows[0] as { text: string }[]).map(p => p.text).join('')
// A session's opening: focus 3 at goals, verification 3 with nothing owed, course 3.
export const opening = { health: 9, level: 'goals', plan: '' }
