// Reads and verdicts in flight across /clear and a change of session, and the order they land in.
import { expect, test } from 'claude-code/testing'

import { PLAN, boxes, planText, world, started, ended, say, readFile, onPlan, turnDone, lastWritten, opening } from '../tests/fixtures/focus-world'

test('a verdict that lands after /clear is dropped', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: ['off'] })
  await ended($)
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  await readFile($)
  await clock.settle()

  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
})

test('a message typed before /clear is not judged as a message after it', async ($, on) => {
  const { judged, clock } = await onPlan($, on)
  await say($, 'fix the sender')
  await $.prompt.submit({ text: 'now the pricing page', turnId: 't' } as never)
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  await say($, 'start on the invoices')
  await turnDone($, clock)
  await turnDone($, clock)

  expect(judged[0]).toContain('Latest message:\nstart on the invoices')
  expect(judged.join('\n')).not.toContain('fix the sender')
  expect(judged.join('\n')).not.toContain('pricing')
})

test('a skill asked for before /clear is no plan candidate after it', async ($, on) => {
  const { clock, asked } = await onPlan($, on)
  await $.tool.call({ tool: 'Skill', skill: 'review' } as never)
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  const before = asked.length
  await $.skill.prompt({ skill: 'review', text: '# Review\nDone: x', frontmatter: {}, source: 'userSettings' } as never)
  await clock.settle()

  expect(asked).toHaveLength(before)
})

test('a read that lands after /clear is dropped', async ($, on) => {
  const { clock, writes } = world(on, { files: { [PLAN]: planText(3, 6) } })
  await started($)
  await readFile($)
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  await clock.settle()

  expect(lastWritten(writes)).toEqual(opening)
})

test('a read in flight when /clear runs is dropped', async ($, on) => {
  const { clock, writes } = world(on, { files: { [PLAN]: planText(3, 6) }, readDelays: [50] })
  await started($)
  await readFile($)
  await clock.settle()
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  await clock.advance(100)

  expect(lastWritten(writes)).toEqual(opening)
})

test('a verdict in flight when /clear runs is dropped', async ($, on) => {
  // Its correction would cost the next session 1 of health if its row landed there.
  const { clock, writes } = await onPlan($, on, { verdicts: [{ focus: 'off', userCorrection: true, after: 50 }] })
  await ended($)
  await clock.settle()
  await $.session.end({ reason: 'clear' } as never)
  await $.session.start({ source: 'clear', cwd: '/w' } as never)
  await clock.advance(100)

  expect(lastWritten(writes)).toEqual(opening)
})

test('a read in flight when the session changes lands in neither session', async ($, on) => {
  const { clock, writes, session } = world(on, { files: { [PLAN]: planText(3, 6) }, readDelays: [50] })
  await started($)
  await readFile($)
  await clock.settle()
  session.id = 's2'
  await say($, 'start the next thing')
  await clock.advance(100)
  const plans = (id: string) => writes.filter(w => w.path.endsWith(`focus-${id}.json`)).map(w => JSON.parse(w.text).plan)

  expect(new Set(plans('s1'))).toEqual(new Set(['']))
  expect(new Set(plans('s2'))).toEqual(new Set(['']))
})

test('a read in flight when the session changes lands in neither session, though nothing else happens first', async ($, on) => {
  const { clock, writes, session } = world(on, { files: { [PLAN]: planText(3, 6) }, readDelays: [50] })
  await started($)
  await readFile($)
  await clock.settle()
  session.id = 's2'
  await clock.advance(100)

  expect(writes.filter(w => w.path.endsWith('focus-s2.json')).map(w => JSON.parse(w.text).plan)).toEqual([''])
})

test("a message typed before the session changes under its turn is still that turn's latest message", async ($, on) => {
  const { judged, clock, session } = await onPlan($, on)
  await say($, 'go')
  session.id = 's2'
  await turnDone($, clock)

  expect(judged.at(-1)).toContain('Latest message:\ngo')
})

test("a message typed once the session has changed is that session's latest message", async ($, on) => {
  const { judged, clock, session } = await onPlan($, on)
  session.id = 's2'
  await say($, 'go')
  await turnDone($, clock)

  expect(judged.at(-1)).toContain('Latest message:\ngo')
})

test('verdicts land in the order their turns ended, however long each read takes', async ($, on) => {
  const { clock, writes } = await onPlan($, on, { verdicts: [{ focus: 'on', after: 50 }, 'off'] })
  await ended($)
  await ended($)
  await clock.advance(100)

  expect(lastWritten(writes).level).toBe('regroup')
})

test('a slow read of a plan never lands over a newer read of it', async ($, on) => {
  const { clock, writes, files } = world(on, { files: { [PLAN]: planText(3, 6) }, readDelays: [50], verdicts: ['on', 'on', 'on'] })
  await started($)
  await readFile($)
  await clock.settle()
  files[PLAN] = '# g\nPaths: mods/hq\nDone: tests pass\n'
  await readFile($)
  await clock.advance(100)
  for (let i = 0; i < 3; i++) await turnDone($, clock)

  // The newer text has no done boxes, so three turns on it are goals; the older one's six boxes would make it clear.
  expect(lastWritten(writes).level).toBe('goals')
})

test("a verdict on a plan's goal that lands after the plan is re-read with a new goal is dropped", async ($, on) => {
  const { clock, writes, files } = await onPlan($, on, { verdicts: [{ focus: 'off', after: 50 }] })
  await ended($)
  files[PLAN] = planText(3, 6, 'mods/hq', 'a new goal')
  await readFile($)
  await clock.advance(10)
  await clock.advance(100)

  expect(lastWritten(writes)).toEqual({ health: 9, level: 'goals', plan: 'p.md' })
})
