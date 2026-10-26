import { expect, test } from 'claude-code/testing'

import { callOf, recordOf, type ToolCall } from './tool-call'

const none: ToolCall = { mark: null, path: null, command: '', edited: null, offers: null, needsCwd: false }

test('a finished call says what it marks, the file it names, whether it edits and what it offers as a plan', () => {
  const rows: [string, Record<string, unknown>, Partial<ToolCall>][] = [
    ['Edit', { file_path: 'docs/plans/a.md' }, { mark: 'w', path: 'docs/plans/a.md', edited: 'docs/plans/a.md', offers: { kind: 'file', path: 'docs/plans/a.md' }, needsCwd: true }],
    ['MultiEdit', { file_path: '/w/src/app.ts' }, { mark: 'w', path: '/w/src/app.ts', edited: '/w/src/app.ts', needsCwd: true }],
    ['Write', { file_path: '/w/todo.md' }, { mark: 'w', path: '/w/todo.md', edited: '/w/todo.md', offers: { kind: 'file', path: '/w/todo.md' }, needsCwd: true }],
    ['NotebookEdit', { notebook_path: '/w/.sdlc/n.ipynb' }, { mark: 'w', path: '/w/.sdlc/n.ipynb', edited: '/w/.sdlc/n.ipynb', needsCwd: true }],
    ['Read', { file_path: 'todo.md' }, { mark: 'r', path: 'todo.md', offers: { kind: 'file', path: 'todo.md' }, needsCwd: true }],
    ['Read', { notebook_path: '/w/.sdlc/n.ipynb' }, { mark: 'r', needsCwd: true }],
    ['Bash', { command: 'cat .sdlc/spec.md' }, { mark: 'b', command: 'cat .sdlc/spec.md', needsCwd: true }],
    ['Bash', { command: 'gh issue view 513 -R o/r' }, { mark: 'b', command: 'gh issue view 513 -R o/r', offers: { kind: 'issue', issue: 'https://github.com/o/r/issues/513' }, needsCwd: true }],
    ['ExitPlanMode', {}, { offers: { kind: 'plan mode' }, needsCwd: true }],
    ['Glob', { pattern: '.sdlc/*.md' }, {}],
  ]

  for (const [tool, input, call] of rows) expect(callOf(tool, input)).toEqual({ ...none, ...call })
})

test('a gh issue view names its issue by URL with a repo, else by number, and skips the values of its flags', () => {
  const issue = (command: string) => callOf('Bash', { command }).offers

  expect(issue('gh issue view 513')).toEqual({ kind: 'issue', issue: '#513' })
  expect(issue("gh issue view --repo o/r '#7'")).toEqual({ kind: 'issue', issue: 'https://github.com/o/r/issues/7' })
  expect(issue('gh issue view 513 --repo=o/r')).toEqual({ kind: 'issue', issue: 'https://github.com/o/r/issues/513' })
  expect(issue('gh issue view --json title 9')).toEqual({ kind: 'issue', issue: '#9' })
  expect(issue('gh issue view https://github.com/o/r/issues/9')).toEqual({ kind: 'issue', issue: 'https://github.com/o/r/issues/9' })
  expect(issue('linear issue view ADM-17')).toBe(null)
})

test('a gh issue view offers its issue only when it is the whole command and names a literal issue', () => {
  const issue = (command: string) => callOf('Bash', { command }).offers

  expect(issue('ls -R docs && gh issue view 513')).toBe(null)
  expect(issue('gh issue view 513 | grep -R foo .')).toBe(null)
  expect(issue('gh issue view --web && echo ok')).toBe(null)
  expect(issue('gh issue view "$N"')).toBe(null)
  expect(issue('echo "gh issue view 513"')).toBe(null)
  expect(issue('gh issue view --repo o/r #7')).toBe(null)
  expect(issue('gh issue view 513 # the sender')).toEqual({ kind: 'issue', issue: '#513' })
  expect(issue("gh issue view 513 --json body -q '.body | ascii'")).toEqual({ kind: 'issue', issue: '#513' })
  expect(issue('gh issue view --repo "$REPO" 513')).toBe(null)
  expect(issue('gh issue view -R "`cmd`" 513')).toBe(null)
  expect(issue("gh issue view --repo '$o/r' 513")).toEqual({ kind: 'issue', issue: 'https://github.com/$o/r/issues/513' })
  expect(issue('gh issue view 513\nls -R docs')).toBe(null)
  expect(issue('gh issue view 513 2>&1')).toEqual({ kind: 'issue', issue: '#513' })
  expect(issue('gh issue view 513 2>/dev/null')).toEqual({ kind: 'issue', issue: '#513' })
  expect(issue('gh issue view 513 > out.txt')).toBe(null)
  for (const url of ['https://github.com/o/r/issues/9#issuecomment-123', 'https://github.com/o/r/issues/9/', 'http://github.com/o/r/issues/9'])
    expect(issue(`gh issue view ${url}`)).toEqual({ kind: 'issue', issue: 'https://github.com/o/r/issues/9' })
})

test("a finished call's record for the health score: its command, a Bash result as text, and whether it errored or was refused", () => {
  const record = (tool: string, input: Record<string, unknown>, ran: object) => recordOf(tool, input, ran as never)
  const plain = { tool: 'Bash', command: 'npm test', result: '', isError: false, isRefused: false }

  expect(record('Bash', { command: 'npm test' }, { result: { stdout: '3 passed', stderr: '' } })).toEqual({ ...plain, result: '3 passed\n' })
  expect(record('Bash', { command: 'npm test' }, { result: 'a\nb' })).toEqual({ ...plain, result: 'a\nb' })
  expect(record('Bash', { command: 'npm test' }, { deny: 'no' })).toEqual({ ...plain, result: 'no', isError: true, isRefused: true })
  expect(record('Bash', { command: 'npm test' }, { result: '<tool_use_error>blocked', isError: true })).toEqual({ ...plain, result: '<tool_use_error>blocked', isError: true, isRefused: true })
  expect(record('Bash', { command: 'npm test' }, { result: 'exit 1', isError: true })).toEqual({ ...plain, result: 'exit 1', isError: true })
  expect(record('Edit', { file_path: '/w/a.ts' }, { result: 'ok' })).toEqual({ ...plain, tool: 'Edit', command: '' })
  expect(record('Edit', { file_path: '/w/a.ts' }, { result: 'EACCES', isError: true })).toEqual({ ...plain, tool: 'Edit', command: '', isError: true })
})
