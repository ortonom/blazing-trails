import type { ToolCallResult } from 'claude-code'

import type { Mark } from '../types'
import type { Call } from './scorecard'

export const EDITORS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']
// The `gh issue view` flags that take the next word as their value.
const VALUED = /^(--json|-q|--jq|-t|--template)$/

// The text of a result a guard, hook or the person refused: that call never ran, so it is no check.
const REFUSED = /^(<tool_use_error>|This session is isolated|The user doesn't want to proceed|PreToolUse:\w+ hook error)/

// What a finished main-session call can offer as a plan: plan mode's plan, a Markdown file it wrote or read, or the
// issue a `gh issue view` printed.
export type Offer = { kind: 'plan mode' } | { kind: 'file'; path: string } | { kind: 'issue'; issue: string }

// A finished call, read once: w, r or b for a file it writes, a file it reads or a command whose words may name files;
// the file a file tool names, a notebook's for a write; its command; the file it edits; what it offers as a plan; and
// whether its paths resolve against the session's folder.
export type ToolCall = { mark: Mark | null; path: string | null; command: string; edited: string | null; offers: Offer | null; needsCwd: boolean }

export function callOf(tool: string, input: Record<string, unknown>): ToolCall {
  const isEditor = EDITORS.includes(tool)
  const mark: Mark | null = isEditor ? 'w' : tool === 'Read' ? 'r' : tool === 'Bash' ? 'b' : null
  const named = isEditor ? (input.file_path ?? input.notebook_path) : tool === 'Read' ? input.file_path : null
  const path = typeof named === 'string' ? named : null
  const command = tool === 'Bash' ? String(input.command ?? '') : ''
  const issue = tool === 'Bash' ? issueOf(command) : null
  const offers: Offer | null =
    tool === 'ExitPlanMode'
      ? { kind: 'plan mode' }
      : path?.endsWith('.md')
        ? { kind: 'file', path }
        : issue
          ? { kind: 'issue', issue }
          : null

  return { mark, path, command, edited: isEditor ? path : null, offers, needsCwd: mark !== null || offers !== null }
}

// A finished call as the health score records it: its tool, its Bash command, a Bash result as text, the only result
// read as a check's outcome, and whether it errored or was refused.
export function recordOf(tool: string, input: Record<string, unknown>, ran: ToolCallResult): Call {
  const isDenied = 'deny' in ran
  const result = tool !== 'Bash' ? '' : isDenied ? String(ran.deny) : textOf(ran.result)
  const isError = isDenied || !!ran.isError

  return { tool, command: String(input.command ?? ''), result, isError, isRefused: isDenied || (isError && REFUSED.test(result)) }
}

// A tool result as text: a string as it is, a shell's output, or the result as JSON.
function textOf(result: unknown) {
  if (typeof result === 'string') return result
  const out = (result ?? {}) as { stdout?: unknown; stderr?: unknown }
  if (typeof out.stdout === 'string' || typeof out.stderr === 'string') return `${out.stdout ?? ''}\n${out.stderr ?? ''}`
  try {
    return JSON.stringify(result) ?? ''
  } catch {
    return ''
  }
}

// The words of one plain command as the shell reads them, quotes taken off and a comment dropped; null for a command
// that runs on to another line, chains, pipes, redirects its output, substitutes or escapes, whose output is not that
// one command's. Sending stderr to stdout or away leaves stdout the command's own.
function wordsOf(command: string): string[] | null {
  const words: string[] = []
  let word = ''
  let quote = ''
  let isWord = false
  for (const ch of command.trim().replace(/(^|\s)2>(&1|\/dev\/null)(?=\s|$)/g, '$1')) {
    if (quote) {
      if (ch === quote) quote = ''
      else if (quote === '"' && /[$`\\]/.test(ch)) return null
      else word += ch
      continue
    }
    if (ch === '#' && !isWord) break
    if (/[|;&<>`$()\\\n\r]/.test(ch)) return null
    if (/\s/.test(ch)) {
      if (isWord) words.push(word)
      word = ''
      isWord = false
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else word += ch
    isWord = true
  }
  if (quote) return null
  if (isWord) words.push(word)

  return words
}

// The issue a `gh issue view` command names, as a URL when it names the repo, else as #number; null unless the command
// is that one call and names the issue by a literal number or URL.
function issueOf(command: string) {
  const words = wordsOf(command)
  if (!words || words[0] !== 'gh' || words[1] !== 'issue' || words[2] !== 'view') return null
  let repo = ''
  let named = ''
  for (let i = 3; i < words.length; i++) {
    const w = words[i]!
    const flag = w.match(/^(?:-R|--repo)(?:=(.*))?$/)
    if (flag) repo = flag[1] ?? words[++i] ?? ''
    else if (VALUED.test(w)) i++
    else if (!w.startsWith('-') && !named) named = w
  }
  const url = named.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#].*)?$/)
  if (url) return `https://github.com/${url[1]}/issues/${url[2]}`
  const number = named.match(/^#?(\d+)$/)?.[1]
  if (!number) return null

  return repo ? `https://github.com/${repo}/issues/${number}` : `#${number}`
}
