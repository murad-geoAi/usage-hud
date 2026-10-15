import { expect, mock, test } from 'claude-code/testing'

import {
  EFFORTS,
  MODELS,
  THEMES,
  bar,
  base64,
  borderFor,
  clockTime,
  cycle,
  dayKey,
  donutCells,
  findModel,
  formatEta,
  modelButton,
  money,
  nextRoute,
  nextTheme,
  pace,
  parseRoute,
  prettyModel,
  resetsIn,
  routeContext,
  shortSpan,
  sparkline,
  tokensLabel,
  uptime,
  withRoute,
  workerLine,
  workerOf,
} from './register'

const HOME = 'C:\\Users\\tester'
// as the engine hands the path to fs hooks: separators normalized
const ROUTING = 'C:\\Users\\tester\\.claude\\delegation\\routing.json'

/** An in-memory file system answering `$.fs.read` / `$.fs.write`, and a home directory. */
const fakeFiles = (on: Parameters<typeof mock.store>[0], files: Record<string, string>) => {
  mock.env(on, { USERPROFILE: HOME })
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text } as never
  })
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined } as never
  })
  // core's answer to a prompt: what entered, the context with it
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  return files
}

const mountBand = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.ui.mount({
    plugin: 'usage-hud',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 160,
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })

test('base64 matches the standard encoding', () => {
  expect(base64(new Uint8Array([]))).toBe('')
  expect(base64(new Uint8Array([77]))).toBe('TQ==')
  expect(base64(new Uint8Array([77, 97]))).toBe('TWE=')
  expect(base64(new Uint8Array([77, 97, 110]))).toBe('TWFu')
})

test('formats model, ETA and reset time', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(prettyModel('claude-sonnet-4-20250514')).toBe('sonnet 4')
  expect(formatEta(4 * 60000)).toBe('~4m')
  expect(resetsIn(new Date(130 * 60000).toISOString(), 0)).toBe('resets in 2h 10m')
  expect(resetsIn(undefined, 0)).toBe('resets in --')
  expect(resetsIn(new Date((3 * 1440 + 4 * 60) * 60000).toISOString(), 0)).toBe('resets in 3d 4h')
  expect(formatEta(90 * 60000)).toBe('~1h 30m')
})

test('/usage-hud toggles the HUD', async ($, on) => {
  mock.store(on)
  const ran = await $.command.run({
    command: 'usage-hud',
    args: '',
    origin: { kind: 'composer' },
    presentation: { layout: 'main', columns: 120 },
  } as never)
  expect(ran.text).toBe('Usage HUD hidden.')
  const again = await $.command.run({
    command: 'usage-hud',
    args: '',
    origin: { kind: 'composer' },
    presentation: { layout: 'main', columns: 120 },
  } as never)
  expect(again.text).toBe('Usage HUD shown.')
})

test('bars and sparkline render', () => {
  expect(bar(0.5, 8)).toBe('▰▰▰▰▱▱▱▱')
  expect(bar(2, 4)).toBe('▰▰▰▰')
  expect(bar(-1, 4)).toBe('▱▱▱▱')
  expect(sparkline([0, 50, 100])).toBe('▁▅█')
})

test('border warns at 85 and 95 percent', () => {
  expect(borderFor(40, THEMES.classic)).toBe('gray')
  expect(borderFor(85, THEMES.classic)).toBe('#fbbf24')
  expect(borderFor(95, THEMES.classic)).toBe('#f87171')
  expect(borderFor(90, THEMES.mocha)).toBe('#f9e2af')
  expect(borderFor(90, THEMES.nord)).toBe('#ebcb8b')
  expect(borderFor(40, THEMES.claude)).toBe('#d77757')
  expect(borderFor(90, THEMES.claude)).toBe('#f2c14e')
  expect(borderFor(97, THEMES.claude)).toBe('#e05d5d')
})

test('/usage-hud theme switches and validates', async ($, on) => {
  mock.store(on)
  const run = (args: string) =>
    $.command.run({
      command: 'usage-hud',
      args,
      origin: { kind: 'composer' },
      presentation: { layout: 'main', columns: 120 },
    } as never)
  expect((await run('theme mocha')).text).toBe('Usage HUD theme: mocha.')
  expect((await run('theme claude')).text).toBe('Usage HUD theme: claude.')
  expect((await run('theme: nord')).text).toBe('Usage HUD theme: nord.')
  expect((await run('theme nope')).text).toContain('Usage: /usage-hud [theme <classic|nord|mocha|claude> | model ')
  expect((await run('model gpt')).text).toContain('Usage:')
  expect((await run('model claude-typo')).text).toContain('Usage:')
  expect((await run('model opus')).text).toBe('Model: opus 5.5 (from the next request).')
  expect((await run('model default')).text).toBe('Model: session default (from the next request).')
  expect((await run('effort high')).text).toBe('Effort: high (from the next request).')
  expect((await run('effort turbo')).text).toContain('Usage:')
  expect((await run('bogus')).text).toContain('Usage: /usage-hud [theme <classic|nord|mocha|claude> | model ')
})

test('theme button cycles and uptime reads', () => {
  expect(nextTheme('classic')).toBe('nord')
  expect(nextTheme('nord')).toBe('mocha')
  expect(nextTheme('mocha')).toBe('claude')
  expect(nextTheme('claude')).toBe('classic')
  expect(uptime(0, 125 * 60000)).toBe('2h 5m')
  expect(uptime(0, 5 * 60000)).toBe('5m')
})

test('session panel formats cost and clock', () => {
  expect(money(null)).toBe('$--')
  expect(money(0.4)).toBe('$0.40')
  expect(money(12.34)).toBe('$12.3')
  expect(clockTime(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05')
})

test('token labels', () => {
  expect(tokensLabel(200000)).toBe('200k')
  expect(tokensLabel(1000000)).toBe('1M')
  expect(tokensLabel(1500000)).toBe('1.5M')
})

test('model and effort cycling', () => {
  const ids = MODELS.map(m => m.id)
  expect(cycle(ids, null)).toBe('claude-opus-5-5')
  expect(cycle(ids, 'claude-opus-5-5')).toBe('claude-sonnet-5-5')
  expect(cycle(ids, 'claude-fable-5-1')).toBe(null)
  expect(cycle(EFFORTS, 'max')).toBe(null)
  expect(cycle(EFFORTS, null)).toBe('low')
  expect(findModel('opus')).toBe('claude-opus-5-5')
  expect(findModel('Sonnet 5.5')).toBe('claude-sonnet-5-5')
  expect(findModel('claude-opus-4-1')).toBe(undefined)
  expect(findModel('claude-opus-5-5')).toBe('claude-opus-5-5')
  expect(findModel('gpt')).toBe(undefined)
  expect(modelButton(null)).toBe('auto')
  expect(modelButton('claude-haiku-5-5')).toBe('haiku 5.5')
})

test('donut encodes 10x5 cells of three u32 words', () => {
  for (const pct of [null, 0, 42, 100]) {
    // 50 cells * 12 bytes = 600 bytes = 800 base64 characters
    expect(donutCells(pct, THEMES.claude).length).toBe(800)
  }
})

for (const columns of [160, 90]) {
  test(`the band draws on the terminal at ${columns} columns`, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: Date.UTC(2026, 9, 9, 12) })
    const ui = await $.ui.mount({
      plugin: 'usage-hud',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns: columns,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    })
    const themeButton = await ui.find({ key: 'theme' })
    expect(themeButton?.text).toContain('Theme')
    expect(themeButton?.text).toContain('classic')
    await ui.press({ key: 'theme' })
    expect((await ui.find({ key: 'theme' }))?.text).toContain('nord')
    expect(await ui.findAll({ type: 'Raster' })).toHaveLength(3)
  })
}

test('pace forecast', () => {
  const min = 60000
  const now = 60 * min
  // 10% -> 30% over the last 40 minutes: 70% left at 0.5%/min is 140 minutes
  const rising = [{ t: now - 40 * min, pct: 10 }, { t: now, pct: 30 }]
  expect(pace(rising, new Date(now + 300 * min).toISOString(), now)).toEqual({ text: 'limit in ~2h 20m', isRisk: true })
  expect(pace(rising, new Date(now + 60 * min).toISOString(), now)).toEqual({ text: 'safe till reset', isRisk: false })
  expect(pace([{ t: now, pct: 30 }], undefined, now).text).toBe('pace steady')
  expect(pace([], undefined, now).text).toBe('pace --')
  expect(pace([{ t: now, pct: 100 }], undefined, now).text).toBe('limit reached')
})

test('route preference parses, cycles and keeps other keys', () => {
  expect(parseRoute(undefined)).toBe('auto')
  expect(parseRoute('not json')).toBe('auto')
  expect(parseRoute('{"preference":"gpt"}')).toBe('auto')
  expect(parseRoute('{"preference":"gemini"}')).toBe('gemini')
  expect(nextRoute('auto')).toBe('claude')
  expect(nextRoute('claude')).toBe('codex')
  expect(nextRoute('codex')).toBe('gemini')
  expect(nextRoute('gemini')).toBe('auto')
  expect(JSON.parse(withRoute('{"preference":"auto","codexModel":"x"}', 'codex'))).toEqual({ preference: 'codex', codexModel: 'x' })
  expect(JSON.parse(withRoute('[1]', 'claude'))).toEqual({ preference: 'claude' })
  expect(routeContext('codex')).toContain('preference=codex')
  expect(routeContext('codex')).toContain("not Claude Code's model")
})

test('worker commands are recognised only at the start', () => {
  expect(workerOf('codex exec --sandbox read-only - < task.md')).toBe('codex')
  expect(workerOf('  agy -p "x" --mode plan < t.md')).toBe('gemini')
  expect(workerOf('agy --print "x"')).toBe('gemini')
  expect(workerOf('agy --prompt "x"')).toBe('gemini')
  expect(workerOf('codex login status')).toBe(null)
  expect(workerOf('agy')).toBe(null)
  expect(workerOf('agy models')).toBe(null)
  // Gemini CLI no longer serves personal accounts, so it is not a worker any more
  expect(workerOf('gemini -p "x"')).toBe(null)
  expect(workerOf('echo codex exec')).toBe(null)
  expect(workerOf('codex execute')).toBe(null)
})

test('worker line', () => {
  expect(workerLine(null, null)).toBe('idle')
  expect(workerLine({ name: 'codex', startedAt: new Date(2026, 0, 1, 9, 5).getTime() }, null)).toBe('codex running since 09:05')
  expect(workerLine(null, { name: 'gemini', ms: 18000, outcome: 'ok' })).toBe('last gemini 18s · ok')
  expect(workerLine(null, { name: 'codex', ms: 125 * 60000, outcome: 'failed' })).toBe('last codex 2h 5m · failed')
  expect(shortSpan(400)).toBe('0s')
})

test('the Route button cycles and writes routing.json, keeping its other keys', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12) })
  const files = fakeFiles(on, { [ROUTING]: '{"preference":"auto","codexModel":null}' })
  const ui = await mountBand($)
  expect((await ui.find({ key: 'route' }))?.text).toContain('auto')
  expect(await ui.find({ text: /idle/ })).toBeDefined()
  await ui.press({ key: 'route' })
  expect((await ui.find({ key: 'route' }))?.text).toContain('claude')
  expect(JSON.parse(files[ROUTING] ?? '')).toEqual({ preference: 'claude', codexModel: null })
  await ui.press({ key: 'route' })
  expect(JSON.parse(files[ROUTING] ?? '').preference).toBe('codex')
})

test('a typed prompt carries the preference the file holds now', async ($, on) => {
  mock.store(on)
  const files = fakeFiles(on, { [ROUTING]: '{"preference":"gemini"}' })
  const typed = await $.prompt.submit({ text: 'scan this repo', origin: { kind: 'composer' } } as never)
  expect(typed.context).toEqual([routeContext('gemini')])
  files[ROUTING] = '{"preference":"codex"}'
  const again = await $.prompt.submit({ text: 'review it', origin: { kind: 'composer' } } as never)
  expect(again.context).toEqual([routeContext('codex')])
})

test('a missing routing.json reads as auto', async ($, on) => {
  mock.store(on)
  fakeFiles(on, {})
  const typed = await $.prompt.submit({ text: 'hi', origin: { kind: 'composer' } } as never)
  expect(typed.context).toEqual([routeContext('auto')])
})

test('day key is the local date', () => {
  expect(dayKey(new Date(2026, 9, 9, 23, 59).getTime())).toBe('2026-10-09')
})

test('a full context shows the compact button and the 5h line shows the pace', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12) })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200000, tokens: 170000, percent: 85 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
    changed: ['context', 'rateLimits'],
  })
  const ui = await $.ui.mount({
    plugin: 'usage-hud',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 160,
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })
  expect((await ui.find({ key: 'compact' }))?.text).toContain('compact now')
  expect(await ui.find({ text: /pace steady/ })).toBeDefined()
  expect(await ui.find({ text: /of 200k tokens/ })).toBeDefined()
})
