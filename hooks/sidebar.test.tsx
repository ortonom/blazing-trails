import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { skin } from '../skin'

type World = {
  env?: Record<string, string>
  files?: Record<string, string>
  stored?: Record<string, unknown>
  isPlaced?: boolean
  commands?: { name: string; description: string; source: string; plugin?: string }[]
}

function world(on: any, { env = {}, files = {}, stored = {}, isPlaced = true, commands = [] }: World = {}) {
  const opens: unknown[] = []
  mock.env(on, { HOME: '/home/w', ...env })
  mock.store(on, stored)
  mock.clock(on, { now: 1_800_000_000_000 })
  on('fs.write', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/w' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }))
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  on('command.list', () => ({
    value: [
      { name: 'sidebar', description: 'Open the ortonom sidebar', source: 'plugin', plugin: 'ortonom' },
      { name: 'ortonom:fingerprint', description: 'Name the established concept behind a described but unnamed idea. Use when the user has the gist.', source: 'plugin', plugin: 'ortonom' },
      { name: 'ortonom:cold-read', description: 'Critique the draft from the perspective of an uninformed reader. Use on cold read.', source: 'plugin', plugin: 'ortonom' },
      { name: 'ortonom:descatter', description: 'Consolidate duplicate ideas into a canonical location.', source: 'plugin', plugin: 'ortonom' },
      { name: 'ortonom:silent-failure', description: 'Hunt for controls that fail without telling anyone.', source: 'plugin', plugin: 'ortonom' },
      { name: 'ortonom:dif', description: 'Show a change as a diff and nothing else.', source: 'plugin', plugin: 'ortonom' },
      { name: 'hq', description: 'Open hq', source: 'plugin', plugin: 'hq' },
      ...commands,
    ],
  }))
  on('fs.read', ($: any, e: any) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('ui.open', ($: any, e: any) => {
    opens.push(e)
    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } }
  })
  on('ui.log', () => ({ value: undefined }))
  // The engine's own band, empty: what shows when ortonom passes.
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  return { opens }
}

// A session whose stored state holds a plan, /w/docs/plans/p.md with six done boxes, not yet judged: goals, health 9.
const PLANNED = {
  goal: { thread: 'g', spec: '/w/docs/plans/p.md', done: 'tests pass', paths: ['mods/hq'], cwd: '/w', home: '/home/w' },
  doneBoxes: 6,
  edits: { inside: 0, outside: 0 },
  ask: '',
  turns: 0,
  adopted: [],
  verdicts: [],
  rows: [],
}
const planned = (on: any, more: World = {}) => world(on, { ...more, stored: { 'focusV1:s1': { state: PLANNED, at: 1_800_000_000_000 } } })

const started = ($: Engine) => $.session.start({ source: 'startup', cwd: '/w' } as never)
const pane = ($: Engine, bodyColumns = 46) =>
  $.ui.mount({ plugin: 'ortonom', surface: 'terminal', component: 'Pane', requestId: 'ortonom', props: { bodyColumns } } as never)
// The pane on its Commands tab; it opens on Health.
const commandsTab = async ($: Engine) => {
  const shown = await pane($)
  await shown.press({ key: 'tab-commands' } as never)
  return shown
}
const band = ($: Engine, hasSurvey = false) =>
  $.ui.mount({ plugin: 'ortonom', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey, isWorking: false, maxRows: 10, bodyColumns: 75 } } as never)
const bandText = async (shown: { drawn: () => Promise<unknown> }) => strings(await shown.drawn()).join('')

type Node = { props?: Record<string, unknown>; children?: unknown }
const strings = (node: unknown): string[] =>
  typeof node === 'string' || typeof node === 'number'
    ? [String(node)]
    : Array.isArray(node)
      ? node.flatMap(strings)
      : node && typeof node === 'object'
        ? strings((node as Node).children ?? [])
        : []
const every = (node: unknown, is: (n: Node) => boolean): Node[] =>
  Array.isArray(node)
    ? node.flatMap(child => every(child, is))
    : node && typeof node === 'object'
      ? is(node as Node)
        ? [node as Node]
        : every((node as Node).children, is)
      : []

test('nothing is drawn above the prompt', async ($, on) => {
  planned(on)
  await started($)

  expect(await bandText(await band($))).toBe('')
})

test('the pane shows no plan or on-track bar', async ($, on) => {
  planned(on)
  await started($)
  const text = strings(await (await pane($)).drawn()).join('\n')

  for (const gone of ['On track', 'At risk', 'Off track']) expect(text).not.toContain(gone)
})

test('the pane opens only on /sidebar, with the keyboard', async ($, on) => {
  const { opens } = world(on)
  await started($)
  expect(opens).toEqual([])

  await $.command.run({ command: 'sidebar', args: '' } as never)
  expect(opens).toEqual([expect.objectContaining({ id: 'ortonom', title: 'Blazing Trails', focus: true })])
})

test('/sidebar says so when the pane has no room', async ($, on) => {
  world(on, { isPlaced: false })
  await started($)

  expect(await $.command.run({ command: 'sidebar', args: '' } as never)).toMatchObject({ text: 'Blazing Trails not opened: narrow.' })
})

test('Session skills come first under their heading, then a rule, then Repo skills', async ($, on) => {
  world(on)
  await started($)
  const text = strings(await (await commandsTab($)).drawn()).join('\n')

  expect(text).toContain('Session')
  expect(text.indexOf('Session')).toBeLessThan(text.indexOf('/cold-read'))
  const rule = text.indexOf('─', text.indexOf('/fingerprint'))
  expect(text.indexOf('/fingerprint')).toBeLessThan(rule)
  expect(rule).toBeLessThan(text.indexOf('Repo'))
  expect(text.indexOf('Repo')).toBeLessThan(text.indexOf('/descatter'))
})

test('silent-failure has its own group last, with the search this session has under it', async ($, on) => {
  world(on)
  await started($)
  const text = strings(await (await commandsTab($)).drawn()).join('\n')

  const rule = text.indexOf('─', text.indexOf('/descatter'))
  expect(text.indexOf('/descatter')).toBeLessThan(rule)
  expect(rule).toBeLessThan(text.indexOf('Silent failure'))
  expect(text.indexOf('Silent failure')).toBeLessThan(text.indexOf('/silent-failure'))
  expect(text).not.toContain('★')
})

test('with no plugin.json to read, every entry lists as a skill, by name', async ($, on) => {
  world(on)
  await started($)
  const rows = every(await (await commandsTab($)).drawn(), n => n.props?.color === skin.title).map(n => strings(n).join(''))

  expect(rows).toEqual(['/cold-read', '/dif', '/fingerprint', '/descatter', '/silent-failure'])
})

test('an entry plugin.json does not ship as a skill lists under Commands, after Repo and before Silent failure', async ($, on) => {
  const manifest = JSON.stringify({ skills: ['./skills/session/cold-read', './skills/session/fingerprint', './skills/repo/descatter', './skills/silent-failure/silent-failure'] })
  const isManifest = (k: unknown) => typeof k === 'string' && k.endsWith('/.claude-plugin/plugin.json')
  const files = new Proxy({} as Record<string, string>, { has: (_, k) => isManifest(k), get: (_, k) => (isManifest(k) ? manifest : undefined) })
  world(on, { files })
  await started($)
  const drawn = await (await commandsTab($)).drawn()
  const rows = every(drawn, n => n.props?.color === skin.title).map(n => strings(n).join(''))
  const text = strings(drawn).join('\n')

  expect(rows).toEqual(['/cold-read', '/fingerprint', '/descatter', '/dif', '/silent-failure'])
  // The group heading, not the tab of the same name above the list.
  const commands = text.indexOf('Commands', text.indexOf('Session'))
  expect(text.indexOf('Repo')).toBeLessThan(commands)
  expect(commands).toBeLessThan(text.indexOf('/dif'))
  expect(text.indexOf('/dif')).toBeLessThan(text.indexOf('Silent failure'))
})

test("the pane lists the plugin's own skills and commands as the engine lists them, and nothing from outside the plugin", async ($, on) => {
  world(on)
  await started($)
  const text = strings(await (await commandsTab($)).drawn()).join('\n')

  expect(text).toContain('/cold-read')
  expect(text).toContain('/fingerprint')
  expect(text).not.toContain('ortonom:')
  expect(text).toContain('Name the established concept behind a described but unnamed idea')
  expect(text).not.toContain('Use when the user has the gist')
  expect(text).not.toContain('/hq')
  expect(text).not.toContain('/sidebar')
})

const press = async (shown: { press: (t: { key: string }) => Promise<unknown> }, key: string) => shown.press({ key })
const buttons = (node: unknown) => every(node, n => typeof n.props?.label === 'string').map(n => n.props?.label)

test('the pane opens on Health, with a tab for Health, Commands and About', async ($, on) => {
  world(on)
  await started($)
  const drawn = await (await pane($)).drawn()

  expect(buttons(drawn)).toEqual(['Health', 'Commands', 'About'])
  expect(strings(drawn).join('')).toContain('HP ')
  expect(strings(drawn).join('\n')).not.toContain('/cold-read')
})

test('a command whose bare name a built-in owns shows by the name that runs it', async ($, on) => {
  world(on, {
    commands: [
      { name: 'statusline', description: 'Set up the status line', source: 'builtin' },
      { name: 'ortonom:statusline', description: 'Statusline — point your statusLine setting at the copy.', source: 'plugin', plugin: 'ortonom' },
    ],
  })
  await started($)
  const rows = every(await (await commandsTab($)).drawn(), n => n.props?.color === skin.title).map(n => strings(n).join(''))

  expect(rows).toContain('/ortonom:statusline')
  expect(rows).toContain('/cold-read')
})

test('each skill that uses a companion carries what this session found under it', async ($, on) => {
  world(on)
  await started($)
  const text = strings(await (await commandsTab($)).drawn()).join('\n')

  expect(text.indexOf('/descatter')).toBeLessThan(text.indexOf('domain-modeling not installed'))
  expect(text.indexOf('/cold-read')).toBeLessThan(text.indexOf('/fingerprint'))
})

const health = async ($: Engine) => strings(await (await pane($)).drawn()).join('\n')
const stored = (state: Record<string, unknown>) => ({ stored: { 'focusV1:s1': { state: { ...PLANNED, ...state }, at: 1_800_000_000_000 } } })

test('Health is the HP row and, while the session goes well, that all is good; nothing of how it is scored', async ($, on) => {
  planned(on)
  await started($)
  const drawn = await (await pane($)).drawn()
  const text = strings(drawn).join('\n')

  expect(strings(drawn).join('')).toBe('HealthCommandsAboutHP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS✓ all good')
  expect(text).toContain('all good')
})

test('Health says how to make a plan while none is in force', async ($, on) => {
  world(on)
  await started($)

  expect(await health($)).toContain('no plan: press shift+tab for plan mode, or point Claude at a spec')
})

test('Health shows one card, with what to do, when the session needs the person', async ($, on) => {
  world(on, stored({ verdicts: ['off'] }))
  await started($)
  const text = await health($)

  expect(text).toContain('The last turn drifted from the goal.')
  expect(text).toContain('Worth checking the goal is still the right one.')
  expect(text).not.toMatch(/\/\w/)
  expect(text).not.toContain('all good')
})

test('Health says three drifting turns in words, and suggests clarifying done', async ($, on) => {
  world(on, stored({ verdicts: ['off', 'off', 'off'] }))
  await started($)
  const text = await health($)

  expect(text).toContain('Three turns have drifted from the goal.')
  expect(text).toContain('Worth clarifying what done looks like.')
})

// The cards steer: each suggests clarifying or checking, and none tells the person to stop, must, or run a command.
test('every Health card is a suggestion, never an order or a command', () => {
  for (const need of Object.values(skin.needs)) expect(`${need.line(2)} ${need.todo}`).not.toMatch(/\b(stop|must|fix it|regroup)\b|\//i)
})

test('Health asks for an objective once three turns go by with none', async ($, on) => {
  world(on, stored({ goal: null, doneBoxes: 0, turns: 3 }))
  await started($)

  expect(await health($)).toContain('No goal named yet.')
})

test('Health draws a ? after the level while the last turn could not be read', async ($, on) => {
  world(on, stored({ isUnread: true }))
  await started($)

  expect(strings(await (await pane($)).drawn()).join('')).toContain('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS ?')
})

test("About gives the version, each companion with what this session found, and what the plugin writes and spends", async ($, on) => {
  const manifest = JSON.stringify({ version: '9.8.7', skills: ['./skills/session/fingerprint'] })
  const isManifest = (k: unknown) => typeof k === 'string' && k.endsWith('/.claude-plugin/plugin.json')
  const files = new Proxy({} as Record<string, string>, { has: (_, k) => isManifest(k), get: (_, k) => (isManifest(k) ? manifest : undefined) })
  world(on, { files })
  await started($)
  const shown = await pane($)
  await press(shown, 'tab-about')
  const text = strings(await shown.drawn()).join('\n')

  expect(text).toContain('9.8.7')
  expect(text).toMatch(/domain-modeling[^\n]*not installed/)
  expect(text).toContain('haiku')
  expect(text).toContain('state/focus-')
  expect(text).toContain('/plugin')
  expect(text).toContain('structured')
  expect(text).toContain('github.com/ortonom/blazing-trails')
})

// The plugin searches with WebSearch; a Perplexity CLI is used, and named, only on a machine that sets ORTONOM_SEARCH=pplx.
test('the pane names no search tool while ORTONOM_SEARCH is unset', async ($, on) => {
  world(on)
  await started($)
  const shown = await pane($)
  const seen: string[] = []
  for (const tab of ['tab-health', 'tab-commands', 'tab-about']) {
    await press(shown, tab)
    seen.push(strings(await shown.drawn()).join('\n'))
  }

  expect(seen.join('\n')).not.toMatch(/pplx|perplexity|searching with/i)
})

test('with ORTONOM_SEARCH=pplx, About says whether the Perplexity CLI was found', async ($, on) => {
  world(on, { env: { ORTONOM_SEARCH: 'pplx', PATH: '/usr/bin' } })
  await started($)
  const shown = await pane($)
  await press(shown, 'tab-about')

  expect(strings(await shown.drawn()).join('\n')).toMatch(/pplx[^\n]*not found/)
})

test('the tab chosen stays chosen when the pane opens again', async ($, on) => {
  world(on)
  await started($)
  const first = await pane($)
  await press(first, 'tab-about')
  await (first as unknown as { unmount: () => Promise<void> }).unmount()
  const text = strings(await (await pane($)).drawn()).join('\n')

  expect(text).toContain('haiku')
  expect(text).not.toContain('/cold-read')
})

test('Commands brings the list back after another tab', async ($, on) => {
  world(on)
  await started($)
  const shown = await pane($)
  await press(shown, 'tab-health')
  await press(shown, 'tab-commands')

  expect(strings(await shown.drawn()).join('\n')).toContain('/cold-read')
})

test("cold-read shows its four asks and its reader, second-opinion", async ($, on) => {
  world(on)
  await started($)
  const text = strings(await (await commandsTab($)).drawn()).join('\n')
  const entry = text.slice(text.indexOf('/cold-read'), text.indexOf('/dif'))

  expect(entry).toContain('cold read · proofread · edit · review')
  expect(entry).toContain('second-opinion')
})

test('About says how to open the sidebar', async ($, on) => {
  world(on)
  await started($)
  const shown = await pane($)
  await press(shown, 'tab-about')

  expect(strings(await shown.drawn()).join('\n')).toContain('/sidebar')
})

// The status line's palette: the terminal's named ANSI colours, which follow the person's own scheme.
const PALETTE = ['ansi256(3)', 'ansi256(11)', 'ansi256(1)', 'ansi256(2)', 'ansi256(6)', 'ansi256(5)', 'ansi256(0)']
const colours = (node: unknown) =>
  every(node, n => typeof n.props?.color === 'string' || typeof n.props?.backgroundColor === 'string').flatMap(n =>
    [n.props?.color, n.props?.backgroundColor].filter((c): c is string => typeof c === 'string'),
  )

test("every colour the sidebar draws is from the status line's palette", async ($, on) => {
  planned(on)
  await started($)
  const shown = await pane($)
  const seen: string[] = []
  for (const tab of ['tab-health', 'tab-commands', 'tab-about']) {
    await press(shown, tab)
    seen.push(...colours(await shown.drawn()))
  }

  expect(seen.length).toBeGreaterThan(0)
  expect(seen.filter(c => !PALETTE.includes(c))).toEqual([])
})
