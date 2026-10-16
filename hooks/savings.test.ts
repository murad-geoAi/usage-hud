import { expect, test } from 'claude-code/testing'

import { codexTone, dayStart, formatTokens, parseLedger, savedLine, totalsFor } from './savings'

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo, d, h, mi, s).getTime()

test('parses ledger lines, skips broken ones, and labels legacy lines unknown', () => {
  const text = [
    '{"at":1,"task":"review diff","session":"s1","codexTokens":{"input":100,"output":20}}',
    '{broken json',
    '{"at":2,"codexTokens":{"input":5,"output":5}}',
    '{"no":"timestamp"}',
    '',
  ].join('\n')
  expect(parseLedger(text)).toEqual([
    { at: 1, task: 'review diff', session: 's1', tokens: 120 },
    { at: 2, task: 'unknown', session: null, tokens: 10 },
  ])
})

test('today runs from local midnight: 00:00:00 counts, 23:59:59 yesterday does not', () => {
  const now = local(2026, 9, 16, 12, 0, 0)
  const entries = parseLedger([
    `{"at":${local(2026, 9, 15, 23, 59, 59)},"session":"s1","codexTokens":{"input":1000,"output":0}}`,
    `{"at":${local(2026, 9, 16, 0, 0, 0)},"session":"s1","codexTokens":{"input":2000,"output":0}}`,
    `{"at":${local(2026, 9, 16, 11, 0, 0)},"session":"s1","codexTokens":{"input":3000,"output":500}}`,
  ].join('\n'))
  expect(dayStart(now)).toBe(local(2026, 9, 16))
  expect(totalsFor(entries, now, { id: 's1', since: 0 })).toEqual({ session: 6500, today: 5500 })
})

test('session counts only lines whose session matches the current ID', () => {
  const now = local(2026, 9, 16, 12)
  const entries = parseLedger([
    '{"at":' + (now - 1000) + ',"session":"current","codexTokens":{"input":100,"output":0}}',
    '{"at":' + (now - 1000) + ',"session":"other","codexTokens":{"input":900,"output":0}}',
    '{"at":' + (now - 1000) + ',"codexTokens":{"input":50,"output":0}}',
  ].join('\n'))
  expect(totalsFor(entries, now, { id: 'current', since: 0 })).toEqual({ session: 100, today: 1050 })
})

test('without a session ID, session counts from when the HUD first rendered', () => {
  const now = local(2026, 9, 16, 12)
  const entries = parseLedger([
    '{"at":' + (now - 3000) + ',"codexTokens":{"input":10,"output":0}}',
    '{"at":' + (now - 1000) + ',"codexTokens":{"input":20,"output":0}}',
  ].join('\n'))
  expect(totalsFor(entries, now, { id: null, since: now - 2000 })).toEqual({ session: 20, today: 30 })
})

test('formats tokens in k below a million and M above', () => {
  expect(formatTokens(12_400)).toBe('12k')
  expect(formatTokens(84_000)).toBe('84k')
  expect(formatTokens(999_499)).toBe('999k')
  expect(formatTokens(1_200_000)).toBe('1.2M')
  expect(formatTokens(3_000_000)).toBe('3M')
})

test('Codex 5h colour: 70 and 90 are uncoloured, 71 and 91 coloured, unknown uncoloured', () => {
  expect(codexTone(70)).toBe('none')
  expect(codexTone(71)).toBe('warn')
  expect(codexTone(90)).toBe('warn')
  expect(codexTone(91)).toBe('bad')
  expect(codexTone(null)).toBe('none')
})

test('the Saved line shows Saved: -- with no readable ledger, and Codex -- when unknown', () => {
  expect(savedLine(null, 40)).toBe('Saved: -- · Codex 5h: 40%')
  expect(savedLine({ session: 12_000, today: 84_000 }, null)).toBe('Saved: 12k session · 84k today · Codex 5h: --')
  expect(savedLine({ session: 12_000, today: 84_000 }, 40.4)).toBe('Saved: 12k session · 84k today · Codex 5h: 40%')
  expect(parseLedger('not json\n{broken')).toEqual([])
})
