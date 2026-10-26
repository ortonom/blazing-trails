import { expect, test } from 'claude-code/testing'

import fixture from '../tests/fixtures/focus-file'
import { focusFileOf, focusFolder, focusPath } from './focus-file'

test('STATUSLINE_STATE names the folder, then CLAUDE_CONFIG_DIR/state, then ~/.claude/state; an empty one counts as unset', () => {
  expect(focusFolder({ STATUSLINE_STATE: '/s', CLAUDE_CONFIG_DIR: '/c', HOME: '/h' })).toBe('/s')
  expect(focusFolder({ STATUSLINE_STATE: '', CLAUDE_CONFIG_DIR: '/c', HOME: '/h' })).toBe('/c/state')
  expect(focusFolder({ CLAUDE_CONFIG_DIR: '', HOME: '/h' })).toBe('/h/.claude/state')
})

test('with no HOME and no CLAUDE_CONFIG_DIR there is no folder', () => {
  expect(focusFolder({ HOME: '' })).toBe(null)
  expect(focusFolder({})).toBe(null)
})

test("a session's focus file is named by its session id", () => {
  expect(focusPath('/h/.claude/state', 's1')).toBe('/h/.claude/state/focus-s1.json')
})

test('the file is version 1 of the signal, its HP row and its places', () => {
  expect(focusFileOf({ health: 5, level: 'regroup', plan: 'p.md' }, [{ path: '/w/docs/plans/p.md', label: 'w docs/plans/', mark: 'r' }])).toEqual(fixture)
})
