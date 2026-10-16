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

import { codexInstalledIn, pickFeature, readFeatures } from './spec'

const feat = (name: string, done: number, total: number) => ({ name, done, total, blocked: 0, next: null })

test('pickFeature: keeps selection, then branch, first unfinished, first, none', () => {
  const fs = [feat('a', 2, 2), feat('b', 0, 3), feat('c', 1, 3)]
  expect(pickFeature(fs, 'c', 'feature/a')).toBe('c')
  expect(pickFeature(fs, 'gone', 'feature/a')).toBe('a')
  expect(pickFeature(fs, null, 'main')).toBe('b')
  expect(pickFeature([feat('a', 2, 2)], null, null)).toBe('a')
  expect(pickFeature([], 'a', 'feature/a')).toBeNull()
})

test('readFeatures skips _template, sorts, tolerates missing specs and tasks.md', async () => {
  const files: Record<string, string> = { 'D:/p/specs/b/tasks.md': '- [x] T1 a\n- [ ] T2 b\n', 'D:/p/specs/a/tasks.md': '- [ ] T1 x BLOCKED\n' }
  const $: any = {
    fs: {
      list: async (p: string) => {
        if (p !== 'D:/p/specs') throw new Error('ENOENT')
        return [{ name: 'b', kind: 'dir' }, { name: '_template', kind: 'dir' }, { name: 'c', kind: 'dir' }, { name: 'a', kind: 'dir' }, { name: 'f.md', kind: 'file' }]
      },
      read: async (p: string) => { if (p in files) return files[p]; throw new Error('ENOENT') },
    },
  }
  expect((await readFeatures($, 'D:\\p')).map(f => f.name)).toEqual(['a', 'b'])
  expect((await readFeatures($, 'D:/p'))[1]).toEqual({ name: 'b', done: 1, total: 2, blocked: 0, next: 'T2 b' })
  expect(await readFeatures($, 'D:/none')).toEqual([])
})

test('codexInstalledIn: absent only when the file parses', () => {
  expect(codexInstalledIn('{"plugins":{"codex@openai":[{}],"x@y":[]}}')).toBe(true)
  expect(codexInstalledIn('{"plugins":{"x@y":[]}}')).toBe(false)
  expect(codexInstalledIn('{oops')).toBeNull()
  expect(codexInstalledIn(undefined)).toBeNull()
  expect(codexInstalledIn('{"plugins":[]}')).toBeNull()
})
