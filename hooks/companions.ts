import type { EngineInterface, Register } from 'claude-code'

import type { Companion } from '../types'
import { failed } from './failed'

// Companions: tools outside the plugin that some of its skills use when they are installed.
// Each is found once at session start, and each skill that uses one is handed a line saying what this session has.
// The search skills use WebSearch; a machine that sets ORTONOM_SEARCH=pplx has them search with its Perplexity CLI
// instead, and only there is that CLI looked for or named.
export const PPLX =
  "Search: pplx. Run each search as `pplx search '<query>'` in Bash, Photon's ranked, dated sources; a pplx call that fails or hangs runs again with WebSearch."
export const DOMAIN_MODELING =
  "Companion: domain-modeling is installed. After it runs, the scope is each term it resolved or redefined, with this repo's pod, or this repo where it has none. Where it resolved none, say so and stop."

const found = { isPplxAsked: false, pplx: false, domainModeling: false }

// What a skill is handed for a companion: its line for what this session found (undefined hands the skill its text
// unchanged) and its note under the skill in the sidebar (undefined draws none).
const search = {
  line: () => (found.pplx ? PPLX : undefined),
  note: () => (found.isPplxAsked ? (found.pplx ? 'searching with pplx' : 'searching with WebSearch') : undefined),
}
const USES: readonly { skill: string; companion: 'pplx' | 'domain-modeling'; line: () => string | undefined; note: () => string | undefined }[] = [
  { skill: 'fingerprint', companion: 'pplx', ...search },
  { skill: 'silent-failure', companion: 'pplx', ...search },
  {
    skill: 'descatter',
    companion: 'domain-modeling',
    line: () => (found.domainModeling ? DOMAIN_MODELING : undefined),
    note: () => (found.domainModeling ? 'starting from domain-modeling' : 'domain-modeling not installed'),
  },
]
const usedBy = (companion: string) => USES.filter(u => u.companion === companion).map(u => u.skill).join(', ')

// What this session found, for the sidebar: a note under each skill that uses a companion, and each companion for About.
export const notes = (): Record<string, string> =>
  Object.fromEntries(USES.flatMap(u => {
    const note = u.note()
    return note === undefined ? [] : [[u.skill, note]]
  }))
export const companions = (): Companion[] => [
  ...(found.isPplxAsked ? [{ name: 'pplx', usedBy: usedBy('pplx'), isFound: found.pplx, found: 'found: searches run on it', missing: 'not found: WebSearch instead' }] : []),
  { name: 'domain-modeling', usedBy: usedBy('domain-modeling'), isFound: found.domainModeling, found: 'installed', missing: 'not installed' },
]

// Whether the pplx the shell would run, the first on PATH, is the Perplexity CLI: a script naming `pplx search` and Perplexity.
async function findPplx($: EngineInterface) {
  const dirs = ((await $.env.get('PATH')) ?? '').split(':').filter(Boolean)
  for (const dir of dirs) {
    const path = `${dir}/pplx`
    const isThere = await $.fs.stat(path).then(s => s.kind === 'file', () => false)
    if (!isThere) continue
    const text = await $.fs.read(path).catch(() => '')
    return typeof text === 'string' && text.includes('pplx search') && text.includes('Perplexity')
  }
  return false
}

// Whether a skill named domain-modeling is installed, on its own or in any plugin.
async function findDomainModeling($: EngineInterface) {
  const commands = await $.command.list()
  return commands.some(c => c.name === 'domain-modeling' || c.name.endsWith(':domain-modeling'))
}

// Called from the plugin's own session.start.
export async function companionsStart($: EngineInterface) {
  found.isPplxAsked = (await $.env.get('ORTONOM_SEARCH')) === 'pplx'
  found.pplx = found.isPplxAsked && (await findPplx($).catch(() => false))
  found.domainModeling = await findDomainModeling($).catch(() => false)
}

export function registerCompanions(on: Parameters<Register>[0]) {
  for (const { skill: name, line } of USES) {
    for (const skill of [name, `ortonom:${name}`]) {
      on('skill.prompt', { skill }, async ($, e, next) => {
        const text = line()

        return next(text === undefined ? e : { ...e, text: `${e.text}\n\n${text}` })
      }).catch(($, e, next) => (failed($, 'companion skill.prompt hook', next.error), next(e)))
    }
  }
}
