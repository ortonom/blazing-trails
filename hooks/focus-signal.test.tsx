// The focus file the hook writes: its shape, the fixtures the status line draws, and when it is written.
import { expect, test } from 'claude-code/testing'

import fixture from '../tests/fixtures/focus-file'
import places from '../tests/fixtures/focus-places'
import { hpParts } from './hp'
import { PLAN, world, started, readFile, write, onPlan, turnDone, FILE, lastWritten, opening } from '../tests/fixtures/focus-world'

test('a new session writes health 9 at goals, with no plan', async ($, on) => {
  const { writes, clock } = world(on)
  await started($)
  await clock.settle()

  expect(writes.at(-1)?.path).toBe(FILE)
  expect(lastWritten(writes)).toEqual(opening)
})

test('the file holds exactly v, health, level, plan, the HP row and the places, health an integer from 0 to 10', async ($, on) => {
  const { writes, clock } = await onPlan($, on, { verdicts: ['on', 'off', 'off', 'off'] })
  for (let i = 0; i < 4; i++) await turnDone($, clock)
  for (const w of writes) {
    const file = JSON.parse(w.text)
    expect(Object.keys(file).sort()).toEqual(['health', 'level', 'places', 'plan', 'rows', 'v'])
    expect(file.v).toBe(1)
    expect(Number.isInteger(file.health) && file.health >= 0 && file.health <= 10).toBe(true)
    expect(['clear', 'goals', 'fragmented', 'regroup', 'pause']).toContain(file.level)
    expect(file.rows).toEqual([hpParts(file.health, file.level)])
  }
})

// The status line's tests draw this same file, so a change to the shape on either side fails one of the two suites.
test('a plan whose latest turn went off writes the shared fixture exactly', async ($, on) => {
  const { writes, clock } = await onPlan($, on, { verdicts: ['off'] })
  await turnDone($, clock)

  expect(JSON.parse(writes.at(-1)!.text)).toEqual(fixture)
})

// The status line's tests draw this file too, so each mark and more than one place is drawn from what publish writes.
test('a plan file written, one read and one named, in three places, write the places fixture exactly', async ($, on) => {
  const { writes, clock } = world(on)
  await started($)
  await write($, '/w/docs/plans/a.md')
  await readFile($, '/home/w/.claude/plans/calm.md')
  await $.tool.call({ tool: 'Bash', command: 'cat .sdlc/spec.md' } as never)
  await clock.settle()

  expect(JSON.parse(writes.at(-1)!.text)).toEqual(places)
})

test('a write to a plan file that was refused or failed puts nothing on the plan row', async ($, on) => {
  const { writes, clock } = world(on)
  await started($)
  await write($, '/w/docs/plans/denied.md')
  await write($, '/w/docs/plans/failing.md')
  await clock.settle()

  expect(JSON.parse(writes.at(-1)!.text).places).toEqual([])
})

test('a write to a plan file that went through puts it on the plan row, written', async ($, on) => {
  const { writes, clock } = world(on)
  await started($)
  await write($, '/w/docs/plans/a.md')
  await clock.settle()

  expect(JSON.parse(writes.at(-1)!.text).places).toEqual([{ path: '/w/docs/plans/a.md', label: 'w docs/plans/', mark: 'w' }])
})

test('a store that cannot save keeps the signal and says so once', async ($, on) => {
  const { logs, clock, writes } = await onPlan($, on, { isStoreBroken: true })
  await turnDone($, clock)
  await turnDone($, clock)

  expect(lastWritten(writes).plan).toBe('p.md')
  expect(logs).toEqual(['ortonom: focus state not saved; it resets on resume'])
})

test('/clear starts over, and any other exit keeps the plan for a resume', async ($, on) => {
  const { writes } = await onPlan($, on)
  await $.session.end({ reason: 'prompt_input_exit' } as never)
  await $.session.start({ source: 'resume', cwd: '/w' } as never)
  expect(lastWritten(writes).plan).toBe('p.md')

  await $.session.end({ reason: 'clear' } as never)
  expect(lastWritten(writes)).toEqual(opening)
})

const older = { state: { goal: null, edits: { inside: 0, outside: 0 }, focus: 1 }, at: 1_800_000_000_000 }

for (const key of ['focus:s1', 'focusV0:s1']) {
  test(`a state stored in another shape under ${key} starts over`, async ($, on) => {
    const { writes, clock } = world(on, { stored: { [key]: older } })
    await $.session.start({ source: 'resume', cwd: '/w' } as never)
    await clock.settle()

    expect(lastWritten(writes)).toEqual(opening)
  })
}

test('an unchanged signal is not written again, and a changed one is', async ($, on) => {
  const { writes, clock } = await onPlan($, on, { verdicts: ['on', 'on', 'off'] })
  const before = writes.length
  await turnDone($, clock)
  await turnDone($, clock)
  expect(writes.length).toBe(before)

  await turnDone($, clock)
  expect(writes.length).toBe(before + 1)
  expect(lastWritten(writes).level).toBe('regroup')
})

test('a resumed session writes the plan it had', async ($, on) => {
  const goal = { thread: 'resumed goal', spec: PLAN, done: 'tests pass', paths: ['mods/hq'], cwd: '/w', home: '/home/w' }
  const state = { goal, doneBoxes: 6, edits: { inside: 0, outside: 0 }, ask: '', turns: 3, adopted: [], verdicts: ['on', 'on', 'on'], rows: [] }
  const { writes, clock } = world(on, { stored: { 'focusV1:s1': { state, at: 1_800_000_000_000 } } })
  await started($)
  await clock.settle()

  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })
})

test('STATUSLINE_STATE names the folder, over CLAUDE_CONFIG_DIR', async ($, on) => {
  const { writes, clock } = world(on, { env: { STATUSLINE_STATE: '/s', CLAUDE_CONFIG_DIR: '/c' } })
  await started($)
  await clock.settle()

  expect(writes.at(-1)?.path).toBe('/s/focus-s1.json')
})

test('a file that cannot be written is said once, and written on a later turn', async ($, on) => {
  const { writes, logs, clock } = world(on, { failWrites: 2 })
  await started($)
  await clock.settle()
  await turnDone($, clock)
  await turnDone($, clock)

  expect(logs).toEqual([`ortonom: ${FILE} not written; a status line reading it shows an older signal or none`])
  expect(writes.length).toBeGreaterThan(0)
})
