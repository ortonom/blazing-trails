import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { DOMAIN_MODELING, PPLX } from './companions'

const PERPLEXITY = '#!/usr/bin/env python3\n"""pplx: a caller of the Perplexity API.\n\n  pplx search <query>\n"""\n'
const IMPOSTOR = '#!/bin/sh\necho "pplx 0.3: pixel-perfect layout exporter. usage: pplx search <glob>"\n'

// A machine whose PATH is `path` and whose files are `files`; a path in `unreadable` exists but cannot be read as text;
// `skills` are the skill names installed beside the plugin's; `search` is ORTONOM_SEARCH, unset when left out.
function machine(on: any, path: string, files: Record<string, string> = {}, unreadable: string[] = [], skills: string[] = [], search?: string) {
  mock.env(on, { HOME: '/home/w', PATH: path, ...(search === undefined ? {} : { ORTONOM_SEARCH: search }) })
  mock.store(on, {})
  mock.clock(on, { now: 1_800_000_000_000 })
  on('session.start', () => ({ cwd: '/w' }))
  on('fs.stat', ($: any, e: any) => {
    if (e.path in files || unreadable.includes(e.path)) return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.read', ($: any, e: any) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error(unreadable.includes(e.path) ? `EILSEQ: ${e.path}` : `ENOENT: ${e.path}`)
  })
  on('fs.write', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('session.cwd', () => ({ value: '/w' }))
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  on('command.list', () => ({ value: skills.map(name => ({ name, description: '', source: 'userSettings' })) }))
  on('ui.log', () => ({ value: undefined }))
  on('skill.prompt', ($: any, e: any) => ({ text: e.text }))
}

const started = ($: Engine) => $.session.start({ source: 'startup', cwd: '/w' } as never)
const prompt = async ($: Engine, skill: string) =>
  ((await $.skill.prompt({ skill, text: '# Skill', frontmatter: {}, source: 'plugin' } as never)) as { text: string }).text

test('a search skill is handed its text unchanged while ORTONOM_SEARCH is unset, a Perplexity CLI on PATH or not', async ($, on) => {
  machine(on, '/usr/bin:/home/w/.local/bin', { '/home/w/.local/bin/pplx': PERPLEXITY })
  await started($)

  expect(await prompt($, 'ortonom:fingerprint')).toBe('# Skill')
  expect(await prompt($, 'silent-failure')).toBe('# Skill')
})

test('with ORTONOM_SEARCH=pplx, fingerprint and silent-failure are told to search with pplx when the Perplexity CLI is first on PATH', async ($, on) => {
  machine(on, '/usr/bin:/home/w/.local/bin', { '/home/w/.local/bin/pplx': PERPLEXITY }, [], [], 'pplx')
  await started($)

  expect(await prompt($, 'ortonom:fingerprint')).toBe(`# Skill\n\n${PPLX}`)
  expect(await prompt($, 'silent-failure')).toBe(`# Skill\n\n${PPLX}`)
})

test('with ORTONOM_SEARCH=pplx and no Perplexity CLI first on PATH, a search skill is handed its text unchanged', async ($, on) => {
  machine(on, '/opt/tools/bin:/home/w/.local/bin', { '/opt/tools/bin/pplx': IMPOSTOR, '/home/w/.local/bin/pplx': PERPLEXITY }, ['/usr/local/bin/pplx'], [], 'pplx')
  await started($)

  expect(await prompt($, 'ortonom:fingerprint')).toBe('# Skill')
})

test('ORTONOM_SEARCH set to anything but pplx leaves the search skills as they are', async ($, on) => {
  machine(on, '/home/w/.local/bin', { '/home/w/.local/bin/pplx': PERPLEXITY }, [], [], 'perplexity')
  await started($)

  expect(await prompt($, 'ortonom:fingerprint')).toBe('# Skill')
})

test('a skill that does not search is handed its text unchanged', async ($, on) => {
  machine(on, '/home/w/.local/bin', { '/home/w/.local/bin/pplx': PERPLEXITY })
  await started($)

  expect(await prompt($, 'ortonom:cold-read')).toBe('# Skill')
})

test('descatter is handed its domain-modeling scope when that skill is installed', async ($, on) => {
  machine(on, '/usr/bin', {}, [], ['domain-modeling'])
  await started($)

  expect(await prompt($, 'ortonom:descatter')).toBe(`# Skill\n\n${DOMAIN_MODELING}`)
})

test("a plugin's domain-modeling counts as installed", async ($, on) => {
  machine(on, '/usr/bin', {}, [], ['someone:domain-modeling'])
  await started($)

  expect(await prompt($, 'descatter')).toBe(`# Skill\n\n${DOMAIN_MODELING}`)
})

test('descatter is handed its text unchanged when domain-modeling is not installed', async ($, on) => {
  machine(on, '/usr/bin', {}, [], ['modeling', 'domain-modeling-notes'])
  await started($)

  expect(await prompt($, 'ortonom:descatter')).toBe('# Skill')
})

test('a skill other than descatter is not handed the domain-modeling scope', async ($, on) => {
  machine(on, '/usr/bin', {}, [], ['domain-modeling'])
  await started($)

  expect(await prompt($, 'ortonom:fingerprint')).toBe('# Skill')
})
