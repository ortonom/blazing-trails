// What becomes the plan: plan files, plan mode, issues and skills, and a read that fails.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PLAN, PLAN_MODE, boxes, planText, reader, world, started, say, readFile, write, onPlan, turnDone, lastWritten, opening } from '../tests/fixtures/focus-world'

test('a plan whose done is checkboxes names the plan, and is clear once 3 turns are on it', async ($, on) => {
  const { writes, clock } = await onPlan($, on, { verdicts: ['on', 'on', 'on'] })
  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })

  for (let i = 0; i < 3; i++) await turnDone($, clock)
  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })
})

test('a plan rewritten with a new goal starts its 3 turns over: clear drops to goals', async ($, on) => {
  const { files, writes, clock } = await onPlan($, on, { verdicts: ['on', 'on', 'on'] })
  for (let i = 0; i < 3; i++) await turnDone($, clock)
  // clear 4 + verification 3 + course 3
  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })

  files[PLAN] = planText(3, 6, 'mods/hq', 'a new goal')
  await readFile($)
  await clock.settle()
  // goals 3 + verification 3 + course 3: no turn judged against the new goal yet
  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
})

test('a plan rewritten with a new done starts its 3 turns over too', async ($, on) => {
  const { files, writes, clock } = await onPlan($, on, { verdicts: ['on', 'on', 'on'] })
  for (let i = 0; i < 3; i++) await turnDone($, clock)
  files[PLAN] = planText(3, 6, 'mods/hq', 'g', 'it ships')
  await readFile($)
  await clock.settle()

  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
})

test('a plan read again with a box ticked keeps its 3 turns: it stays clear', async ($, on) => {
  // A second read would word the goal differently; ticking a box reuses the first read, so it is never asked.
  const reworded = { isAnswered: true as const, text: JSON.stringify({ ...reader(planText(4, 6)), goal: 'g, reworded' }) }
  const { files, writes, clock, asked } = await onPlan($, on, { verdicts: ['on', 'on', 'on'], replies: [{ isAnswered: true, text: JSON.stringify(reader(planText(3, 6))) }, reworded] })
  for (let i = 0; i < 3; i++) await turnDone($, clock)
  files[PLAN] = planText(4, 6)
  await readFile($)
  await clock.settle()

  expect(asked).toHaveLength(1)
  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })
})

test('an approved plan is read after the tool call has returned', async ($, on) => {
  const { files, asked, clock, writes } = world(on)
  files[PLAN_MODE] = planText(0, 3, 'mods/hq', 'Ship the bar')
  await started($)
  await $.tool.call({ tool: 'ExitPlanMode' } as never)
  expect(asked).toHaveLength(0)

  await clock.settle()
  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'quiet-plan.md' })
})

test('a plan that does not say what done looks like is no plan', async ($, on) => {
  const { clock, writes } = world(on, { files: { [PLAN]: planText(0, 3, 'mods/hq', 'g', '') } })
  await started($)
  await readFile($)
  await clock.settle()

  expect(lastWritten(writes)).toEqual(opening)
})

test('a plan with more than ten done boxes reaches clear', async ($, on) => {
  const { clock, writes } = world(on, { files: { [PLAN]: planText(0, 25) }, verdicts: ['on', 'on', 'on'] })
  await started($)
  await readFile($)
  await clock.settle()
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  expect(lastWritten(writes)).toEqual({ health: 10, level: 'clear', plan: 'p.md' })
})

test('a plan whose done is no checkbox tops out at goals', async ($, on) => {
  const { clock, writes } = world(on, { files: { '/w/docs/specs/s.md': '# Spec s\nPaths: src\nDone: it ships\n\nProse only.' }, verdicts: ['on', 'on', 'on'] })
  await started($)
  await readFile($, '/w/docs/specs/s.md')
  await clock.settle()
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 's.md' })
})

test("the plan read's count of done boxes stands over the boxes in the text", async ($, on) => {
  const tasksOnly = { ...reader(planText(0, 4)), doneBoxes: 0 }
  const { clock, writes } = world(on, { files: { [PLAN]: planText(0, 4) }, replies: [{ isAnswered: true, text: JSON.stringify(tasksOnly) }], verdicts: ['on', 'on', 'on'] })
  await started($)
  await readFile($)
  await clock.settle()
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  expect(lastWritten(writes).level).toBe('goals')
})

test('a plan Claude writes is read from the file it wrote', async ($, on) => {
  const { files, clock, writes } = world(on)
  await started($)
  files[PLAN] = planText(0, 2, 'src', 'Written plan')
  await write($, PLAN)
  await clock.settle()

  expect(lastWritten(writes).plan).toBe('p.md')
})

test('a GitHub issue is a plan through gh issue view alone; a chained or quoted one, or a Linear id, is not', async ($, on) => {
  const { clock, writes } = world(on, { issues: { '513': `# Issue plan\nPaths: mods/hq\nDone: the bar shows\n\n${boxes(1, 4)}` } })
  await started($)
  await $.tool.call({ tool: 'Bash', command: 'linear issue view ADM-17' } as never)
  await clock.settle()
  expect(lastWritten(writes).plan).toBe('')

  await $.tool.call({ tool: 'Bash', command: 'ls -R docs && gh issue view 513' } as never)
  await $.tool.call({ tool: 'Bash', command: 'echo "gh issue view 513"' } as never)
  await clock.settle()
  expect(lastWritten(writes).plan).toBe('')

  await $.tool.call({ tool: 'Bash', command: 'gh issue view 513 -R o/r' } as never)
  await clock.settle()
  expect(lastWritten(writes).plan).toBe('513')
})

const runSkill = async ($: Engine, name: string, text: string) => {
  await $.tool.call({ tool: 'Skill', skill: name } as never)
  await $.skill.prompt({ skill: name, text, frontmatter: {}, source: 'userSettings' } as never)
}

test('a skill the session runs that says what done looks like becomes the plan', async ($, on) => {
  const { clock, asked, writes } = await onPlan($, on)
  await runSkill($, 'review', '# Review the branch\nPaths: src\nDone: every finding is reported')
  await clock.settle()

  expect(asked.at(-1)).toContain('# Review the branch')
  expect(lastWritten(writes).plan).toBe('skill:review')
})

test('a skill with no done line leaves the plan, and its turn is not judged', async ($, on) => {
  const { clock, judged, writes } = await onPlan($, on, { verdicts: ['off', 'off'] })
  await runSkill($, 'howto', '# How to format\nPaths: src\nDone: ')
  await turnDone($, clock)

  expect(judged).toHaveLength(0)
  expect(lastWritten(writes)).toMatchObject({ level: 'goals', plan: 'p.md' })
})

test("a skill turn under another plan scores none of its edits against the plan in force", async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['on'] })
  await runSkill($, 'howto', '# How to format\nPaths: src\nDone: ')
  await write($, '/w/bin/tool')
  await turnDone($, clock)

  expect(lastWritten(writes).level).toBe('goals')
})

test("a turn with no new message of the person's is read with an empty latest message", async ($, on) => {
  const { judged, clock } = await onPlan($, on)
  await say($, 'fix the sender')
  await turnDone($, clock)
  await turnDone($, clock)

  expect(judged[1]).toContain('Previous message:\nfix the sender')
  expect(judged[1]).toContain('Latest message:\n\n')
})

test("a skill a subagent loads is no plan candidate", async ($, on) => {
  const { clock, asked } = await onPlan($, on)
  const before = asked.length
  await $.skill.prompt({ skill: 'review', text: '# Sub\nDone: x', frontmatter: {}, source: 'userSettings' } as never)
  await clock.settle()

  expect(asked).toHaveLength(before)
})

test('a failed, aborted or refused read leaves no plan, logs one line and retries at turn end', async ($, on) => {
  const { logs, clock, writes } = world(on, {
    files: { [PLAN]: planText(3, 6) },
    replies: [{ isAnswered: false, reason: 'aborted' }, 'reject', { isAnswered: true, text: 'not json' }],
  })
  await started($)
  await readFile($)
  await clock.settle()
  expect(lastWritten(writes).plan).toBe('')
  expect(logs).toEqual([`couldn't read ${PLAN}: aborted; retrying`])

  await turnDone($, clock)
  await turnDone($, clock)
  expect(lastWritten(writes).plan).toBe('')
  expect(logs).toHaveLength(1)

  await turnDone($, clock)
  expect(lastWritten(writes).plan).toBe('p.md')
})
