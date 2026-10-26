import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, On } from 'claude-code'

import { skin } from '../skin'
import type { About, Skill, Tab } from '../types'
import { adviceOf } from './advice'
import { companions, notes } from './companions'
import { failed } from './failed'
import { readText } from './files'
import { hpParts } from './hp'
import type { Part } from './hp'
import { initial, measure } from './state'

const NAME = 'ortonom'
const PREFIX = `${NAME}:`
const COMMAND = 'sidebar'
// Skills that work on a repo sit below a rule, then the commands, and silent-failure has its own group last; the rest run in any session and come first.
const PLACED: readonly { heading: string; names: readonly string[] }[] = [
  { heading: skin.groups.repo, names: ['descatter'] },
  { heading: skin.groups.silent, names: ['silent-failure'] },
]
const ORDER = [skin.groups.session, skin.groups.repo, skin.groups.commands, skin.groups.silent]
const headingOf = (s: Skill) =>
  s.isCommand ? skin.groups.commands : (PLACED.find(g => g.names.includes(s.name))?.heading ?? skin.groups.session)
const WIDTH = 50
// Rows asked for where the pane opens inline, so a tab shows whole; the engine gives what the layout spares.
const ROWS = 40
const skills = atom({ plugin: 'ortonom', key: 'skills' } as const, [] as Skill[])
const tab = atom({ plugin: 'ortonom', key: 'tab' } as const, 'health' as Tab)
const about = atom({ plugin: 'ortonom', key: 'about' } as const, { version: '', companions: [] } as About)
const TABS: readonly Tab[] = ['health', 'commands', 'about']
// The session's focus state, which focus-state.ts alone writes; declared here as well, since the engine's scan reads a state
// read only from an atom declared in the same file.
const held = atom({ plugin: 'ortonom', key: 'focusV1' } as const, initial())

// A skill's description cut to its first two sentences that are not a "Use …" trigger, at most 100 characters.
function short(description: string) {
  const lead = description
    .split(/(?<=[.!?])\s+(?=[A-Z"'(`])/)
    .filter(s => !s.startsWith('Use '))
    .slice(0, 2)
    .join(' ')

  return lead.length > 100 ? `${lead.slice(0, 99).trimEnd()}…` : lead
}

// The plugin's version and the names of the skills plugin.json ships; no names when it cannot be read, and then everything lists as a skill.
async function readManifest($: EngineInterface) {
  const root = $.plugin.root
  // The engine's root is the plugin's folder; the manifest sits in .claude-plugin/ there, or beside it.
  const text = (await readText($, `${root}/.claude-plugin/plugin.json`)) ?? (await readText($, `${root}/plugin.json`))
  try {
    const manifest = JSON.parse(text ?? '') as { version?: string; skills?: string | string[] }
    // plugin.json takes one skill path or a list of them.
    const listed = manifest.skills ?? []
    const paths = typeof listed === 'string' ? [listed] : listed
    return { version: manifest.version ?? '', skills: new Set(paths.map(p => p.replace(/\/+$/, '').split('/').pop() ?? '')) }
  } catch {
    return { version: '', skills: new Set<string>() }
  }
}

// The plugin's own skills and commands as the engine lists them, so a new one lists itself, by name;
// an entry plugin.json does not ship as a skill is a command. Each carries what this session found of its companion,
// and is typed by its bare name unless another command, such as a built-in, owns that name.
async function loadSkills($: EngineInterface) {
  const [commands, manifest] = await Promise.all([$.command.list().catch(() => []), readManifest($)])
  const note = notes()
  const found = commands
    .filter(c => c.name.startsWith(PREFIX))
    .map(c => {
      const name = c.name.slice(PREFIX.length)
      const typed = commands.some(o => o.name === name && o.plugin !== NAME) ? c.name : name
      return { name, typed, does: short(c.description), isCommand: manifest.skills.size > 0 && !manifest.skills.has(name), ...(note[name] ? { note: note[name] } : {}) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  await update($, skills, () => found)
  await update($, about, () => ({ version: manifest.version, companions: companions() }))
}

// Called from the plugin's own session.start: the /sidebar command, and the skills it lists.
export async function sidebarStart($: EngineInterface) {
  await $.command.register({ name: COMMAND, description: `Open the ${skin.pane} sidebar: this plugin's commands, its health and its help` }).catch(err => failed($, '/sidebar registration', err))
  await loadSkills($)
}

export function registerSidebar(on: On) {
  on('command.run', { command: COMMAND }, async $ => {
    await loadSkills($)
    const opened = await $.ui.open({ id: NAME, title: skin.pane, columns: WIDTH, rows: ROWS, focus: true })

    return { text: opened.isPlaced ? `${skin.pane} opened.` : `${skin.pane} not opened: ${opened.reason}.` }
  }).catch(($, e, next) => (failed($, '/sidebar command', next.error), next(e)))

  // A row of tabs, then the chosen one: Health, the HP row and the one thing the session needs, or that all is good;
  // Commands, the skills in groups under dim headings with a rule between each two, each skill's bare name in the title
  // colour over what it does and what this session found of its companion; About, the version, the output style, where
  // the score is explained, companions, footprint and upkeep.
  on('ui.render', { component: 'Pane', requestId: NAME }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    // A tab an earlier version kept, and this pane no longer has, opens as Health.
    const kept = await read($, tab)
    const shown = TABS.includes(kept) ? kept : 'health'
    const columns = (e.props as { bodyColumns?: number }).bodyColumns ?? WIDTH - 2
    const rule = '─'.repeat(Math.max(1, columns - 2))
    const ruled = (key: string) => (
      <Text key={key} dimColor wrap="truncate">
        {rule}
      </Text>
    )
    const heading = (text: string) => (
      <Text key={text} color={skin.heading} bold wrap="truncate">
        {text}
      </Text>
    )
    const entry = (key: string, title: string, lines: string[], dim: string[] = []) => (
      <Box key={key} flexDirection="column">
        <Text color={skin.title} wrap="truncate">
          {title}
        </Text>
        {lines.map(l => (
          <Box key={l} paddingLeft={2}>
            <Text wrap="wrap">{l}</Text>
          </Box>
        ))}
        {dim.map(l => (
          <Box key={l} paddingLeft={2}>
            <Text dimColor wrap="wrap">
              {l}
            </Text>
          </Box>
        ))}
      </Box>
    )

    async function commandsTab() {
      const all = await read($, skills)
      const groups = ORDER.map(heading => ({ heading, list: all.filter(s => headingOf(s) === heading) })).filter(g => g.list.length > 0)
      return groups.map((g, i) => (
        <Box key={g.heading} flexDirection="column">
          {i > 0 && ruled(`rule-${g.heading}`)}
          {heading(g.heading)}
          {g.list.map(s => entry(s.name, `/${s.typed}`, [s.does], [...(skin.extras[s.name] ?? []), ...(s.note ? [s.note] : [])]))}
        </Box>
      ))
    }

    // Health: the HP row, then the one thing the session needs from the person, or that all is good.
    async function healthTab() {
      const state = await read($, held)
      const { signal: now } = measure(state)
      const advice = adviceOf(state)
      const need = advice && skin.needs[advice.need]
      return [
        <Box key="hp">{hpRow(Text, hpParts(now.health, now.level, state.isUnread))}</Box>,
        need ? (
          <Box key="need" flexDirection="column" marginTop={1} borderStyle="single" borderColor={skin.nudge} paddingLeft={1} paddingRight={1}>
            <Text wrap="wrap">{need.line(advice.count ?? 0)}</Text>
            <Text dimColor wrap="wrap">
              {need.todo}
            </Text>
          </Box>
        ) : (
          <Text key="calm" wrap="truncate">
            <Text color={skin.calm.color}>{skin.calm.mark}</Text>
            <Text dimColor>{` ${skin.calm.words}`}</Text>
          </Text>
        ),
        ...(state.goal
          ? []
          : [
              <Text key="no-plan" dimColor wrap="wrap">
                {skin.noPlan}
              </Text>,
            ]),
      ]
    }

    async function aboutTab() {
      const now = await read($, about)
      return [
        <Text key="open" wrap="wrap">
          {skin.about.open}
        </Text>,
        <Text key="version" wrap="truncate">{`${skin.about.version} ${now.version || 'unknown'}`}</Text>,
        <Text key="style" wrap="wrap">
          {`Output style: ${skin.about.style.name}, ${skin.about.style.means}`}
        </Text>,
        <Text key="guide" dimColor wrap="wrap">
          {skin.about.guide}
        </Text>,
        ruled('rule-companions'),
        heading(skin.about.companionsHeading),
        ...now.companions.map(c => entry(c.name, `${c.name}  ${c.isFound ? c.found : c.missing}`, [], [`for ${c.usedBy}`])),
        ruled('rule-writes'),
        heading(skin.about.writesHeading),
        ...skin.about.writes.map(w => (
          <Text key={w} wrap="wrap">
            {w}
          </Text>
        )),
        ruled('rule-update'),
        heading(skin.about.updateHeading),
        ...skin.about.update.map(u => (
          <Text key={u} wrap="wrap">
            {u}
          </Text>
        )),
      ]
    }

    const body = shown === 'commands' ? await commandsTab() : shown === 'about' ? await aboutTab() : await healthTab()

    return (
      <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
        <Box flexDirection="row">
          {TABS.map((t, i) => (
            <Box key={t} marginRight={i < TABS.length - 1 ? 1 : 0}>
              <Button key={`tab-${t}`} label={skin.tabs[t]} hotkey={String(i + 1)} plain onPress={() => update($, tab, () => t)}>
                {t === shown ? (
                  <Text bold {...skin.activeTab}>{skin.tabs[t]}</Text>
                ) : (
                  <Text dimColor>{skin.tabs[t]}</Text>
                )}
              </Button>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {body}
        </Box>
      </Box>
    )
  })
}

// The HP row's runs as one line of Text, each in its own colour.
function hpRow(Text: Elements[keyof Elements]["Text"], parts: Part[]) {
  return (
    <Text wrap="truncate">
      {parts.map((p, i) => (
        <Text key={String(i)} color={p.color} bold={p.bold} dimColor={p.dim}>
          {p.text}
        </Text>
      ))}
    </Text>
  )
}
