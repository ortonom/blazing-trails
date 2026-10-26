// README.md's health score and levels, each line built from the constants the hooks score with.
import { readdirSync, readFileSync } from 'node:fs'
import { register } from 'node:module'

// The hooks import each other without an extension, as the plugin engine resolves them; Node is told to try `.ts`.
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, next) { try { return await next(s, c) } catch (e) { if (s.startsWith('.')) return next(s + '.ts', c); throw e } }`))

const { LEVELS, RECENT } = await import('../hooks/level.ts')
const { default: planRow } = await import('./fixtures/plan-row.ts')
const { WINDOW, MOST, OWED, SPENT_CAP, COST } = await import('../hooks/scorecard.ts')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
// Claude Code's own commands of the same name as one of the plugin's.
const OWNED = ['statusline']
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const levels = Object.entries(LEVELS)
const names = dir => readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3))
const shipped = {
  skills: JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).skills.map(p => p.split('/').pop()),
  agents: names('agents'),
  commands: names('commands'),
}

const want = [
  ['the window', `scored on the last ${WINDOW} turns`],
  ['focus, by level', `| focus | ${MOST.focus} | the level: ${levels.map(([k, l]) => `\`${k}\` ${l.points}`).join(', ')} |`],
  ['verification', `| verification | ${MOST.verification} | the latest check passed, or none is owed, ${MOST.verification}; edits not yet checked ${OWED};`],
  ['course control', `| course control | ${MOST.course} | less ${COST.correction} for each correction or repeat and ${COST.nudge} for each nudge or interrupt;`],
  ['the caps', `The total is held to ${LEVELS.regroup.cap} at \`regroup\`, to ${LEVELS.pause.cap} at \`pause\`, and to ${SPENT_CAP} when course control reaches 0.`],
  ['the count of levels', `\`level\` is one of ${words[levels.length]}:`],
  ['clear reads the last judged turns', `its last ${RECENT} turns on it |`],
  ['goals reads the last judged turns', `from a plan not yet ${RECENT} turns on track |`],
  ['pause reads the last judged turns', `has been off track ${RECENT} turns`],
  ['the plan row is drawn as the status line draws it', planRow.drawn],
  ['the ? after the level is explained', '`?` after the level'],
  ...levels.map(([k, l]) => [`${k} is drawn as the hooks draw it`, `| \`${k}\` | ${l.drawn} |`]),
  // Everything the plugin ships is named: each skill and agent in a table row, each command where it is described.
  ...shipped.skills.map(n => [`the skill ${n} has a row`, `| \`${n}\``]),
  ...shipped.agents.map(n => [`the agent ${n} has a row`, `| \`${n}\` |`]),
  // A command Claude Code already has a command of its own for is typed with the plugin's prefix; the rest by name.
  ...shipped.commands.map(n => [`the command ${n} is named`, OWNED.includes(n) ? `\`/ortonom:${n}\`` : `\`/${n}\``]),
]

let failed = 0
// The README states one cost for a correction and a repeat, and one for a nudge and an interrupt.
if (COST.correction !== COST.repeat || COST.nudge !== COST.interrupt) { console.log('FAIL  a correction costs what a repeat does, and a nudge what an interrupt does'); failed++ }
for (const [name, line] of want) {
  if (readme.includes(line)) console.log(`ok    ${name}`)
  else { console.log(`FAIL  ${name}\n      wanted: ${line}`); failed++ }
}
console.log(`${want.length + 1 - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
