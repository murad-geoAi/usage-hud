import { expect, test } from 'claude-code/testing'
import { parseTasks } from './spec'

test('parseTasks counts done, blocked and the next task', () => {
  const s = parseTasks('# T\n- [x] T1 [S] a\n- [ ] T2 [M] b BLOCKED: err\n- [ ] T3 [L] c\n  - Done when: x\n- [ ] T4 [S] d\n')
  expect(s).toEqual({ done: 1, total: 4, blocked: 1, next: 'T3 c' })
})

test('parseTasks takes indented and uppercase checkboxes, CRLF', () => {
  const s = parseTasks('  - [X] T1 [S] a\r\n* [ ] T2 [S] b\r\n')
  expect(s).toEqual({ done: 1, total: 2, blocked: 0, next: 'T2 b' })
})

test('parseTasks: empty file is 0/0 and all done has no next', () => {
  expect(parseTasks('')).toEqual({ done: 0, total: 0, blocked: 0, next: null })
  expect(parseTasks('- [x] T1 [S] a\n').next).toBeNull()
})

import { asBuildMode, buildCommand, suggestMode } from './spec'

test('buildCommand fills the right text per action and mode', () => {
  expect(buildCommand('spec', null, 'claude')).toBe('/spec ')
  expect(buildCommand('build', 'a', 'split')).toBe('/build a')
  expect(buildCommand('build', 'a', 'claude')).toBe('/build a --claude')
  expect(buildCommand('resume', 'a', 'codex')).toBe('/resume a --codex')
  expect(buildCommand('check', 'a', 'codex')).toBe('/check a')
  expect(buildCommand('build', null, 'split')).toBeNull()
})

test('asBuildMode falls back to split', () => {
  expect(asBuildMode('codex')).toBe('codex')
  expect(asBuildMode('nope')).toBe('split')
  expect(asBuildMode(undefined)).toBe('split')
})

test('suggestMode: per-window, unknown ignored, Codex pressure wins', () => {
  expect(suggestMode(50, [20, 30], true)).toBeNull()
  expect(suggestMode(90, [20, 30], true)).toBe('codex')
  expect(suggestMode(50, [null, 85], true)).toBe('claude')
  expect(suggestMode(90, [90, null], true)).toBe('claude')
  expect(suggestMode(50, [20, 20], false)).toBe('claude')
  expect(suggestMode(null, [null, null], null)).toBeNull()
  expect(suggestMode(84.9, [84.9], true)).toBeNull()
})
