import { expect, test } from 'claude-code/testing'

import type { Answer, Read } from '../types'
import { consider, countBoxes, freshReads, offered, parseAnswer, retryPending, textKey, type Land, type Port } from './plan-read'
import { callOf } from './tool-call'

const HOME = '/home/w'
const plan = (goal: string, done = 'tests pass', boxes = 2) =>
  `# ${goal}\nDone: ${done}\n\n${Array.from({ length: boxes }, (_, i) => `- [ ] step ${i + 1}`).join('\n')}`
// The model here: its goal is the text's first heading and its done the Done line; a README is no plan.
const answer = (text: string): Answer => ({
  isPlan: !/^# README/m.test(text),
  goal: text.match(/^# (.+)$/m)?.[1] ?? '',
  done: text.match(/^Done: (.*)$/m)?.[1] ?? '',
  paths: [],
})

// held: a read that answers only once released, so a later read can overtake it.
type Reply = Answer | { reason: string } | 'held' | 'throws'

// The plan read's port in memory, and a land that applies each read as soon as it is picked.
function world({ files = {}, replies = [] }: { files?: Record<string, string>; replies?: Reply[] } = {}) {
  const asked: string[] = []
  const logs: string[] = []
  const cache = new Map<string, Answer>()
  const jobs: (() => void)[] = []
  const held: (() => void)[] = []
  const landed: Read[] = []
  const port: Port = {
    file: async path => files[path] ?? null,
    read: text => {
      asked.push(text)
      const reply = replies.shift() ?? answer(text)
      if (reply === 'throws') return Promise.reject(new Error('read crashed'))
      return reply === 'held' ? new Promise(done => held.push(() => done(answer(text)))) : Promise.resolve(reply)
    },
    cached: async key => cache.get(key),
    cache: async (key, a) => void cache.set(key, a),
    later: work => void jobs.push(work),
    log: text => void logs.push(text),
  }
  const land: Land = async pick => {
    const read = pick()
    if (read) landed.push(read)
  }
  // Runs the work left for the next tick, and lets what it awaits finish.
  const settle = async () => {
    for (let i = 0; i < 50; i++) {
      for (const job of jobs.splice(0)) job()
      await Promise.resolve()
    }
  }
  const release = async () => {
    for (const done of held.splice(0)) done()
    await settle()
  }

  return { port, reads: freshReads(), asked, logs, landed, land, settle, release }
}

const at = (source: string, text: string) => ({ source, text, cwd: '/w', home: HOME })

test('checkboxes are counted from list lines only', () => {
  expect(countBoxes('- [x] a\n- [ ] b\n  * [X] c\n[ ] not a list\ntext - [x] inline')).toEqual({ ticked: 2, total: 3 })
})

test('a ticked box leaves the text the same plan for the read cache; any other change does not', () => {
  expect(textKey('# P\n- [x] a\n- [ ] b')).toBe(textKey('# P\n- [ ] a\n- [X] b'))
  expect(textKey('# P\n- [ ] a')).not.toBe(textKey('# P\n- [ ] a, then b'))
})

test('the read answer is JSON of one shape, done included, or none', () => {
  expect(parseAnswer('Here: {"isPlan": true, "goal": "ship it", "done": "tests pass", "paths": ["src", 3]}')).toEqual({
    isPlan: true,
    goal: 'ship it',
    done: 'tests pass',
    paths: ['src'],
  })
  expect(parseAnswer('{"isPlan": true, "goal": "x", "paths": []}')).toBe(null)
  expect(parseAnswer('{"isPlan": "yes", "goal": "x", "done": "", "paths": []}')).toBe(null)
  expect(parseAnswer('{"isPlan": true, "goal": "x"')).toBe(null)
  expect(parseAnswer('no json')).toBe(null)
})

test("plan mode's approved plan is offered under its file", async () => {
  const { port } = world()

  expect(await offered(port, callOf('ExitPlanMode', {}).offers!, { plan: '# Ship', filePath: `${HOME}/.claude/plans/q.md` }, '/w', HOME)).toEqual(at(`${HOME}/.claude/plans/q.md`, '# Ship'))
})

test('a markdown file with boxes or under plans/ or specs/ is offered; other markdown is not', async () => {
  const { port } = world({ files: { '/w/notes.md': 'just notes', '/w/todo.md': '- [ ] a', '/w/docs/specs/s.md': 'prose', '/w/docs/plans/p.md': 'prose' } })

  expect(await offered(port, callOf('Read', { file_path: 'notes.md' }).offers!, 'ok', '/w', HOME)).toBe(null)
  expect(await offered(port, callOf('Read', { file_path: 'todo.md' }).offers!, 'ok', '/w', HOME)).toEqual(at('/w/todo.md', '- [ ] a'))
  expect(await offered(port, callOf('Edit', { file_path: '/w/docs/specs/s.md' }).offers!, 'ok', '/w', HOME)).toEqual(at('/w/docs/specs/s.md', 'prose'))
  expect(await offered(port, callOf('Write', { file_path: '/w/docs/plans/p.md' }).offers!, 'ok', '/w', HOME)).toEqual(at('/w/docs/plans/p.md', 'prose'))
})

test('a draft in a temp folder is not offered, boxes or not', async () => {
  const pad = '/private/tmp/claude-501/-w/s1/scratchpad/hl-body.md'
  const job = `${HOME}/.claude/jobs/be2b43dc/tmp/plans/notes.md`
  const { port } = world({ files: { [pad]: '- [ ] a', '/tmp/a/todo.md': '- [ ] b', '/var/folders/x/T/c.md': '- [ ] c', '/private/var/folders/x/T/f.md': '- [ ] f', [job]: '- [ ] d', '/w/todo.md': '- [ ] e' } })

  for (const file_path of [pad, '/tmp/a/todo.md', '/var/folders/x/T/c.md', '/private/var/folders/x/T/f.md', job]) expect(await offered(port, callOf('Write', { file_path }).offers!, 'ok', '/w', HOME)).toBe(null)
  expect(await offered(port, callOf('Write', { file_path: '/w/todo.md' }).offers!, 'ok', '/w', HOME)).toEqual(at('/w/todo.md', '- [ ] e'))
})

test('a task file is offered as its folder, as is a file in a folder under plans/', async () => {
  const { port } = world({ files: { '/w/work/tasks/retry/01.md': '- [ ] a', '/w/tasks/02.md': '- [ ] b', '/w/docs/plans/big/part.md': 'prose' } })

  expect((await offered(port, callOf('Read', { file_path: '/w/work/tasks/retry/01.md' }).offers!, 'ok', '/w', HOME))?.source).toBe('/w/work/tasks/retry')
  expect((await offered(port, callOf('Read', { file_path: '/w/tasks/02.md' }).offers!, 'ok', '/w', HOME))?.source).toBe('/w/tasks')
  expect((await offered(port, callOf('Read', { file_path: '/w/docs/plans/big/part.md' }).offers!, 'ok', '/w', HOME))?.source).toBe('/w/docs/plans/big')
})

test('gh issue view offers what it printed, under the issue', async () => {
  const { port } = world()
  const printed = { stdout: '# Issue\nDone: x' }

  expect((await offered(port, callOf('Bash', { command: 'gh issue view 513' }).offers!, printed, '/w', HOME))?.source).toBe('#513')
  expect((await offered(port, callOf('Bash', { command: 'gh issue view 513 -R o/r' }).offers!, printed, '/w', HOME))?.source).toBe('https://github.com/o/r/issues/513')
  expect((await offered(port, callOf('Bash', { command: "gh issue view --repo o/r '#7'" }).offers!, printed, '/w', HOME))?.source).toBe('https://github.com/o/r/issues/7')
  expect((await offered(port, callOf('Bash', { command: 'gh issue view https://github.com/o/r/issues/9' }).offers!, printed, '/w', HOME))?.source).toBe('https://github.com/o/r/issues/9')
  expect(callOf('Bash', { command: 'linear issue view ADM-17' }).offers).toBe(null)
  expect(await offered(port, callOf('Bash', { command: 'gh issue view 513' }).offers!, { stdout: '  ' }, '/w', HOME)).toBe(null)
})

test('a plan lands as a read of its source, goal, done and done boxes', async () => {
  const { port, reads, land, landed, settle } = world()
  await consider(port, reads, at('/w/p.md', plan('Ship the bar', 'tests pass', 3)), land)
  await settle()

  expect(landed).toEqual([{ type: 'read', source: '/w/p.md', goal: 'Ship the bar', done: 'tests pass', paths: [], boxes: 3, cwd: '/w', home: HOME }])
})

test('a text read once is not read again, a ticked box included', async () => {
  const { port, reads, land, landed, asked, settle } = world()
  await consider(port, reads, at('/w/p.md', plan('g')), land)
  await settle()
  await consider(port, reads, at('/w/p.md', plan('g').replace('- [ ]', '- [x]')), land)
  await settle()

  expect(asked).toHaveLength(1)
  expect(landed).toHaveLength(2)
})

test('a read that throws is logged, and lands nothing', async () => {
  const { port, reads, land, landed, logs, settle } = world({ replies: ['throws'] })
  await consider(port, reads, at('/w/p.md', plan('g')), land)
  await settle()

  expect(landed).toEqual([])
  expect(logs).toEqual(['reading /w/p.md as a plan failed: read crashed'])
})

test('a read that keeps failing is tried at each turn end, four times in all, and logged twice', async () => {
  const { port, reads, land, landed, asked, logs, settle } = world({ replies: [{ reason: 'a' }, { reason: 'b' }, { reason: 'c' }, { reason: 'd' }] })
  await consider(port, reads, at('/w/p.md', plan('g')), land)
  await settle()
  for (let i = 0; i < 4; i++) {
    retryPending(port, reads, land)
    await settle()
  }

  expect(asked).toHaveLength(4)
  expect(landed).toEqual([])
  expect(logs).toEqual(["couldn't read /w/p.md: a; retrying", "couldn't read /w/p.md after 4 tries: d"])
})

test('a slow read of a document never lands over a newer read of it', async () => {
  const { port, reads, land, landed, settle, release } = world({ replies: ['held'] })
  await consider(port, reads, at('/w/p.md', plan('old')), land)
  await settle()
  await consider(port, reads, at('/w/p.md', plan('new')), land)
  await settle()
  await release()

  expect(landed.map(r => r.goal)).toEqual(['new'])
})

test('a document with no done line lands as one, and holds no place against an older read', async () => {
  const { port, reads, land, landed, settle, release } = world({ replies: ['held'] })
  await consider(port, reads, at('/w/a.md', plan('a')), land)
  await settle()
  await consider(port, reads, at('/w/b.md', plan('b', '')), land)
  await settle()
  await release()

  expect(landed.map(r => [r.source, r.done])).toEqual([
    ['/w/b.md', ''],
    ['/w/a.md', 'tests pass'],
  ])
})

test('a document that is no plan lands with no done', async () => {
  const { port, reads, land, landed, settle } = world()
  await consider(port, reads, at('/w/README.md', `# README\n${plan('x').split('\n').slice(1).join('\n')}`), land)
  await settle()

  expect(landed.map(r => r.done)).toEqual([''])
})
