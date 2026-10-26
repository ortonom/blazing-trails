import { RECENT } from './hooks/level'
import type { Need } from './hooks/advice'

// The pane's look in the status line's palette: the terminal's own 16 colours by index, ansi256(0) to ansi256(15), so it
// follows the person's scheme (a bare name such as 'cyan' is drawn as a fixed 256-colour instead); and the words it draws.
const NUMBERS: Record<number, string> = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' }

export const skin = {
  title: 'ansi256(6)',
  heading: 'ansi256(3)',
  activeTab: { color: 'ansi256(0)', backgroundColor: 'ansi256(6)' },
  pane: 'Blazing Trails',
  tabs: { health: 'Health', commands: 'Commands', about: 'About' },
  extras: {
    'cold-read': ['asks: cold read · proofread · edit · review', 'reader: second-opinion, a fresh agent that sees only the draft and its brief'],
  } as Record<string, readonly string[]>,
  groups: { session: 'Session', repo: 'Repo', commands: 'Commands', silent: 'Silent failure' },
  // The Health tab while nothing needs the person.
  calm: { mark: '✓', color: 'ansi256(2)', words: 'all good' },
  // The one card the Health tab shows when the tracker sees something worth a look: what it noticed, then a way to
  // steer. A nudge to clarify or check, never an order to stop, so every card is one colour.
  nudge: 'ansi256(3)',
  needs: {
    'no-objective': { line: () => 'No goal named yet.', todo: 'A line on what done looks like would help steer.' },
    stalled: { line: () => `${NUMBERS[RECENT] ?? RECENT} turns have drifted from the goal.`, todo: 'Worth clarifying what done looks like.' },
    'off-track': { line: () => 'The last turn drifted from the goal.', todo: 'Worth checking the goal is still the right one.' },
    failed: { line: () => 'A check failed.', todo: 'Worth a look before moving on.' },
    unchecked: { line: () => 'Called done, not yet checked.', todo: 'A test run or a quick look would confirm it.' },
    partly: { line: () => 'The last turn was partly on the goal.', todo: 'Worth checking the goal still fits.' },
    'two-plans': { line: () => 'Two plans are in play.', todo: 'Worth choosing which one leads.' },
    owed: { line: () => "Some edits aren't checked yet.", todo: 'A test run would confirm them.' },
    corrected: { line: (n: number) => (n === 1 ? 'One correction lately.' : `${n} corrections lately.`), todo: "Worth restating what you're after." },
    doubted: { line: () => 'Some doubt about the work lately.', todo: 'Worth asking for a check.' },
  } satisfies Record<Need, { line: (count: number) => string; todo: string }>,
  noPlan: 'no plan: press shift+tab for plan mode, or point Claude at a spec',
  about: {
    open: 'Open this with /sidebar',
    version: 'Version',
    style: { name: 'structured', means: 'on while the plugin is on, in place of the one chosen in /config' },
    guide: 'How HP is scored, each level and the ☰ plan row: github.com/ortonom/blazing-trails',
    companionsHeading: 'Used when installed',
    writesHeading: 'What it writes and spends',
    writes: [
      'a focus file per session under ~/.claude/state/focus-<session>.json, for a status line to draw',
      'one haiku call to read each plan, and one to judge each turn, on your account',
    ],
    updateHeading: 'Update and remove',
    update: ['/plugin → Marketplaces → blazing-trails → Update', '/plugin uninstall ortonom@blazing-trails'],
  },
} as const
