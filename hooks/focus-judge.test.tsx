// How each turn is judged and scored: the levels, checks, corrections and a judge that fails.
import { expect, test } from 'claude-code/testing'

import { FOCUS_READ_PROMPT, PLAN_READ_PROMPT } from './prompts'
import type { Verdict } from '../tests/fixtures/focus-world'
import { PLAN, planText, world, started, ended, say, readFile, write, onPlan, turnDone, lastWritten, hpRow, opening } from '../tests/fixtures/focus-world'

test('the level climbs from fragmented to goals to clear, then falls to regroup and pause', async ($, on) => {
  const { clock, writes, files } = world(on, { verdicts: ['partly', 'on', 'on', 'on', 'on', 'off', 'off', 'off'] })
  await started($)
  await say($, 'fix the sender and maybe the pricing page and the docs')
  await turnDone($, clock)
  expect(lastWritten(writes).level).toBe('fragmented')

  await turnDone($, clock)
  expect(lastWritten(writes).level).toBe('goals')

  files[PLAN] = planText(0, 3)
  await readFile($)
  await clock.settle()
  expect(lastWritten(writes).level).toBe('goals')
  for (let i = 0; i < 3; i++) await turnDone($, clock)
  expect(lastWritten(writes).level).toBe('clear')

  await turnDone($, clock)
  expect(lastWritten(writes).level).toBe('regroup')
  await turnDone($, clock)
  await turnDone($, clock)
  expect(lastWritten(writes).level).toBe('pause')
})

test('two plans read within five turns are fragmented', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { files: { '/w/docs/plans/q.md': planText(0, 2, 'lib', 'h') } })
  await turnDone($, clock)
  await readFile($, '/w/docs/plans/q.md')
  await clock.settle()

  expect(lastWritten(writes)).toMatchObject({ level: 'fragmented', plan: 'q.md' })
})

test('with no plan, each turn is judged against the first substantive message', async ($, on) => {
  const { judged, clock } = world(on)
  await started($)
  await say($, 'hi')
  await turnDone($, clock)
  await say($, 'make the sender retry on a timeout')
  await turnDone($, clock)
  await say($, 'and log each retry')
  await turnDone($, clock)

  expect(judged).toHaveLength(3)
  expect(judged[0]).toContain('Goal: (none stated)')
  expect(judged[1]).toContain('Goal: make the sender retry on a timeout')
  expect(judged[2]).toContain('Goal: make the sender retry on a timeout')
})

test('three turns with no goal at all is pause', async ($, on) => {
  const { clock, writes } = world(on)
  await started($)
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  expect(lastWritten(writes).level).toBe('pause')
})

test('a headless session judges no turn', async ($, on) => {
  const { judged, clock } = world(on)
  await $.session.start({ source: 'startup', cwd: '/w', isInteractive: false } as never)
  await say($, 'make the sender retry on a timeout')
  await turnDone($, clock)

  expect(judged).toHaveLength(0)
})

test('the judge reads the goal, the done line, the latest message and the answer', async ($, on) => {
  const { judged, clock } = await onPlan($, on)
  await say($, 'now fix the pricing page')
  await ended($, 'I changed the pricing page.')
  await clock.settle()

  expect(judged).toHaveLength(1)
  expect(judged[0]).toContain('Goal: g')
  expect(judged[0]).toContain('Done when: tests pass')
  expect(judged[0]).toContain('now fix the pricing page')
  expect(judged[0]).toContain('I changed the pricing page.')
})

test('a clear goal with a passing check is 10; each correction or repeat costs 1, and three cap it at 4', async ($, on) => {
  const { clock, writes } = await onPlan($, on, {
    verdicts: ['on', 'on', 'on', { focus: 'on', userCorrection: true }, { focus: 'on', userRepeat: true }, { focus: 'on', userCorrection: true }],
  })
  await turnDone($, clock)
  await turnDone($, clock)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await turnDone($, clock)
  expect(lastWritten(writes)).toMatchObject({ health: 10, level: 'clear' })

  await say($, 'no, that is wrong')
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(9)

  await say($, 'I asked for the retry already')
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(8)

  await say($, 'no, still wrong')
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(4)
})

test('a done with no check scores no verification until a check passes', async ($, on) => {
  const { clock, writes } = await onPlan($, on)
  await ended($, 'It is done.')
  await clock.settle()
  expect(lastWritten(writes).health).toBe(6)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(9)
})

// What a command run in the turn that claims done makes of the claim: a check that leads its command checks it
// (goals 3 + verification 3 + course 3 = 9); a command that only names a check leaves it unchecked (verification 0, so 6).
const CHECKED: [string, number][] = [
  ['npm test', 9],
  ['cd /w/mods && npm test 2>&1 | tail -5', 9],
  ['CI=1 npx vitest run', 9],
  ['./bin/check-public', 9],
  ['/w/bin/check-public', 9],
  ['timeout 300 node_modules/.bin/vitest run', 9],
  ['python -m pytest -q', 9],
  ['echo curl', 6],
  ['curl -fsS https://example.org/health', 9],
  ['curl -I https://example.org', 9],
  ['curl --fail https://example.org', 9],
  ['curl -sSL -o gitleaks.tgz https://example.org/gitleaks.tgz', 6],
  ['curl https://example.org | sh -f', 6],
  // An -f inside another option's value or a quoted argument is no --fail.
  ['curl -sS -ofile.pdf https://example.org/file.pdf', 6],
  ['curl -sS -d "x -f" https://example.org', 6],
  ['git commit -m "fix the tsc errors"', 6],
  ['grep -rn "npm test" .', 6],
]
for (const [command, health] of CHECKED)
  test(`a done claimed after \`${command}\` scores health ${health}`, async ($, on) => {
    const { clock, writes } = await onPlan($, on)
    await $.tool.call({ tool: 'Bash', command } as never)
    await ended($, 'It is done.')
    await clock.settle()

    expect(lastWritten(writes).health).toBe(health)
  })

test('an edit is owed a check: it scores verification 1 until one passes', async ($, on) => {
  const { clock, writes } = await onPlan($, on)
  await write($, '/w/mods/hq/a.ts')
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(7)

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await turnDone($, clock)
  expect(lastWritten(writes).health).toBe(9)
})

test('an interrupted turn costs course control a fifth of a correction, and is not judged', async ($, on) => {
  const { clock, writes, judged } = await onPlan($, on)
  for (let i = 0; i < 3; i++) {
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
    await clock.settle()
  }

  expect(judged).toHaveLength(0)
  // goals 3 + verification 3 + course 2.4 (three interrupts in the window), rounded to 8
  expect(lastWritten(writes)).toEqual({ health: 8, level: 'goals', plan: 'p.md' })
})

test('three plain turns cost course control nothing', async ($, on) => {
  const { clock, writes } = await onPlan($, on)
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  // goals 3 + verification 3 + course 3
  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
})

// Each way the judge's reply can fail, after two turns on the plan: the third turn is unread, so it counts no verdict
// and draws the ?; goals 3 + verification 3 + course 3 = 9. A third reply that reads on makes it clear 4 + 3 + 3 = 10.
const FAILED_READS: [string, Verdict | 'reject' | 'unanswered' | { raw: string }][] = [
  ['the call throws', 'reject'],
  ['the call ends with no answer', 'unanswered'],
  ['the answer is prose with no JSON', { raw: 'Looks on track to me.' }],
  ['the answer has a verdict but not its correction and repeat marks', { raw: '{"focus":"on"}' }],
]
for (const [how, third] of FAILED_READS)
  test(`a turn whose read fails (${how}) holds the score and draws ?`, async ($, on) => {
    const { clock, writes } = await onPlan($, on, { verdicts: ['on', 'on', third] })
    for (let i = 0; i < 3; i++) await turnDone($, clock)

    expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
    expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS ?')
  })

test('a third reply that reads on makes the plan clear, with no ?', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['on', 'on', { raw: '{"focus":"on","userCorrection":false,"userRepeat":false}' }] })
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■■■■■■■ 10 · ⬆ CLEAR GOAL')
})

test('a turn nothing could be read from holds the score where it was: an open done stays owed', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['on', 'reject', 'reject', 'reject', 'reject', 'reject'] })
  await ended($, 'It is done.')
  await clock.settle()
  // goals 3 + verification 0 (a done with no check) + course 3
  expect(lastWritten(writes).health).toBe(6)
  for (let i = 0; i < 5; i++) await turnDone($, clock)

  // unchanged: no unread turn adds a row, so the done is still in the window
  expect(lastWritten(writes)).toEqual({ health: 6, level: 'goals', plan: 'p.md' })
})

test('quiet turns the judge read age the window as before: an open done fades after 5', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['on', 'on', 'on', 'on', 'on', 'on'] })
  await ended($, 'It is done.')
  await clock.settle()
  for (let i = 0; i < 5; i++) await turnDone($, clock)

  // clear 4 + verification 3 (the done row is out of the 5-row window) + course 3
  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })
})

test('turns nothing could be read from are not counted: three with no objective do not pause', async ($, on) => {
  const { clock, writes } = world(on, { verdicts: ['reject', 'reject', 'reject'] })
  await started($)
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  // the opening, untouched
  expect(lastWritten(writes)).toEqual(opening)
})

test('three read turns with no objective pause', async ($, on) => {
  const { clock, writes } = world(on)
  await started($)
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  // pause 0 + verification 3 + course 3, capped at 3
  expect(lastWritten(writes)).toEqual({ health: 3, level: 'pause', plan: '' })
})

test('an unread turn with an edit still counts the edit: it is owed a check', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['reject'] })
  await write($, '/w/mods/hq/a.ts')
  await turnDone($, clock)

  // goals 3 + verification 1 (the edit is owed a check) + course 3
  expect(lastWritten(writes)).toEqual({ health: 7, level: 'goals', plan: 'p.md' })
})

test('a judge that never answers is given up at 30 s, and the turns after it are still judged', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['hang', 'off'] })
  await turnDone($, clock)
  await turnDone($, clock)
  await clock.advance(29_999)
  // the second turn waits behind the first
  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })

  await clock.advance(1)
  // regroup 1 + verification 3 + course 3, capped at 5
  expect(lastWritten(writes)).toEqual({ health: 5, level: 'regroup', plan: 'p.md' })
})

test('a turn whose judge was given up still counts its facts', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['hang'] })
  await write($, '/w/mods/hq/a.ts')
  await turnDone($, clock)
  await clock.advance(30_000)

  // goals 3 + verification 1 (the edit is owed a check) + course 3; a read given up is a read that failed
  expect(lastWritten(writes)).toEqual({ health: 7, level: 'goals', plan: 'p.md' })
  expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■□□□□□□ 7 · ⬈ GOALS ?')
})

test('a turn the judge could not read draws a dim ? after the level, until a turn is read', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['reject', 'on'] })
  await turnDone($, clock)
  expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS ?')
  expect(JSON.parse(writes.at(-1)!.text).rows[0].at(-1)).toEqual({ text: ' ?', dim: true })

  await turnDone($, clock)
  expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS')
})

test('a turn with no answer to read draws no ?', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['reject'] })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't', reason: 'aborted' } as never)
  await clock.settle()

  // goals 3 + verification 3 + course 2.8 (the interrupt), rounded to 9
  expect(hpRow(writes)).toBe('HP ■■■■■■■■■■■■■■■■■■□□ 9 · ⬈ GOALS')
})

test('a turn started by a slash command is judged against that command', async ($, on) => {
  const { judged, clock } = await onPlan($, on)
  await $.prompt.submit({ text: '/ortonom:cold-read draft.md', command: { name: 'ortonom:cold-read', args: 'draft.md' } } as never)
  await turnDone($, clock)

  expect(judged[0]).toContain('/ortonom:cold-read draft.md')
})

test('a prompt typed while a turn runs is judged with the turn after it', async ($, on) => {
  const { judged, clock } = await onPlan($, on)
  await say($, 'fix the sender')
  await $.prompt.submit({ text: 'now the pricing page', turnId: 't' } as never)
  await turnDone($, clock)
  await turnDone($, clock)

  expect(judged[0]).toContain('Latest message:\nfix the sender')
  expect(judged[0]).not.toContain('pricing')
  expect(judged[1]).toContain('Latest message:\nnow the pricing page')
})

test('edits outside the plan make a turn partly on goal, and the level fragmented', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['on'] })
  await write($, '/w/bin/tool')
  await turnDone($, clock)

  expect(lastWritten(writes).level).toBe('fragmented')
})

test("the plan read and the turn judge are given the plugin's prompts when every read of the plugin's folder fails", async ($, on) => {
  const { systems, clock } = await onPlan($, on, { verdicts: ['on'] })
  await turnDone($, clock)

  expect(systems).toEqual([PLAN_READ_PROMPT, FOCUS_READ_PROMPT])
})
