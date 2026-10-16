import { expect, mock, test } from 'claude-code/testing'

import {
  CODEX_MODELS,
  EFFORTS,
  MODELS,
  THEMES,
  bar,
  base64,
  borderFor,
  clockTime,
  codexLine,
  codexModelButton,
  cycle,
  dayKey,
  donutCells,
  findModel,
  formatEta,
  modelButton,
  measuredPct,
  money,
  nextRoute,
  nextTheme,
  pace,
  parseCodexLimits,
  parseLiveLimits,
  parseRoute,
  parseRouting,
  pressureOf,
  prettyModel,
  resetsIn,
  routeContext,
  shortSpan,
  sparkline,
  tokensLabel,
  uptime,
  windowPct,
  withRouting,
  workerLine,
  workerOf,
} from './register'

const HOME = 'C:\\Users\\tester'
// as the engine hands the path to fs hooks: separators normalized
const ROUTING = 'C:\\Users\\tester\\.claude\\delegation\\routing.json'

/** An in-memory file system answering `$.fs.read` / `write` / `list`, and a home directory. */
const fakeFiles = (on: Parameters<typeof mock.store>[0], files: Record<string, string>, mtimeMs = 0) => {
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
  // a directory is every path the files sit under
  on('fs.list', ($, e) => {
    const prefix = `${e.path.replace(/[\\/]+$/, '')}\\`
    const names = new Map<string, 'file' | 'dir'>()
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue
      const [head, ...rest] = path.slice(prefix.length).split('\\')
      if (head) names.set(head, rest.length > 0 ? 'dir' : 'file')
    }
    if (names.size === 0) throw new Error(`ENOENT: ${e.path}`)
    const value = [...names].map(([name, kind]) => ({
      name,
      kind,
      size: kind === 'file' ? (files[prefix + name] ?? '').length : 0,
      mtimeMs: kind === 'file' ? mtimeMs : 0,
      isLink: false,
    }))
    return { value } as never
  })
  // core's answer to a prompt: what entered, the context with it
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  return files
}

type TestBody = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
const mountBand = ($: Parameters<TestBody>[0]) =>
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
  // Gemini (Antigravity) was dropped as a worker: an old file reads as auto
  expect(parseRoute('{"preference":"gemini"}')).toBe('auto')
  expect(nextRoute('auto')).toBe('claude')
  expect(nextRoute('claude')).toBe('codex')
  expect(nextRoute('codex')).toBe('auto')
  expect(JSON.parse(withRouting('{"preference":"auto","codexModel":"x"}', { preference: 'codex' }))).toEqual({
    preference: 'codex',
    codexModel: 'x',
  })
  expect(JSON.parse(withRouting('[1]', { preference: 'claude' }))).toEqual({ preference: 'claude' })
  const ctx = routeContext({ preference: 'codex', codexModel: 'gpt-6.1-sol', codexEffort: null })
  expect(ctx).toContain('preference=codex codexModel=gpt-6.1-sol codexEffort=default')
  expect(ctx).toContain("not Claude's model")
  expect(ctx.length).toBeLessThan(220) // it rides along with every prompt, so it stays short
  expect(ctx).not.toContain('Gemini')
})

test('the routing block carries usage and a pressure level, and omits them without a reading', () => {
  const r = { preference: 'auto', codexModel: null, codexEffort: null } as const
  const none = { claude5h: null, claudeWk: null, codex5h: null, codexWk: null }
  expect(routeContext(r)).not.toContain('usage ')
  expect(pressureOf(none)).toBe('unknown')
  expect(pressureOf({ ...none, claude5h: 10, claudeWk: 59.4 })).toBe('low')
  expect(pressureOf({ ...none, claude5h: 10, claudeWk: 60 })).toBe('medium') // the fuller window decides
  expect(pressureOf({ ...none, claudeWk: 85 })).toBe('high') // one exhausted window is enough
  expect(pressureOf({ ...none, claude5h: 20 })).toBe('unknown') // a missing window may hide a full one
  const ctx = routeContext(r, { claude5h: 72.4, claudeWk: 41, codex5h: null, codexWk: 5 })
  expect(ctx).toContain('usage claude5h=72% claudeWeek=41% codex5h=? codexWeek=5% pressure=medium.')
  expect(ctx.indexOf('usage ')).toBeGreaterThan(ctx.indexOf('codexEffort=default'))
})

test('live Codex limits parse from the helper line and reject anything malformed', () => {
  const line = '{"fiveHour":{"pct":2,"resetsAt":1792184311000},"weekly":{"pct":16,"resetsAt":1792686664000},"seenAt":1792167596481,"plan":"plus"}'
  expect(parseLiveLimits(`warning on a line before\n${line}\n`)).toEqual({
    fiveHour: { pct: 2, resetsAt: 1792184311000 },
    weekly: { pct: 16, resetsAt: 1792686664000 },
    seenAt: 1792167596481,
    plan: 'plus',
  })
  expect(parseLiveLimits('{"fiveHour":null,"weekly":{"pct":16,"resetsAt":5},"seenAt":1,"plan":null}')?.fiveHour).toBe(null)
  expect(parseLiveLimits('{"fiveHour":null,"weekly":null,"seenAt":1}')).toBe(null) // no limits at all
  expect(parseLiveLimits('{"fiveHour":{"pct":"2","resetsAt":1},"weekly":null,"seenAt":1}')).toBe(null) // wrong types
  expect(parseLiveLimits('{"fiveHour":{"pct":2,"resetsAt":1},"weekly":null}')).toBe(null) // no timestamp
  expect(parseLiveLimits('not json')).toBe(null)
  expect(parseLiveLimits('')).toBe(null)
})

test('codex model and effort parse from routing.json', () => {
  expect(parseRouting(undefined)).toEqual({ preference: 'auto', codexModel: null, codexEffort: null })
  expect(parseRouting('{"codexModel":"gpt-6-astra","codexEffort":"high"}')).toEqual({
    preference: 'auto',
    codexModel: 'gpt-6-astra',
    codexEffort: 'high',
  })
  // no shell-unsafe model names, no unknown efforts
  expect(parseRouting('{"codexModel":"x; rm -rf /","codexEffort":"ultra-max"}')).toEqual({
    preference: 'auto',
    codexModel: null,
    codexEffort: null,
  })
  expect(cycle(CODEX_MODELS, null)).toBe('gpt-6-astra')
  expect(cycle(CODEX_MODELS, 'gpt-5.6-luna')).toBe(null)
  expect(codexModelButton(null)).toBe('default')
  expect(codexModelButton('gpt-6.1-sol')).toBe('6.1-sol')
})

// as a token_count event in a rollout carries it (resets_at in epoch seconds)
const RATE_LINE =
  '{"timestamp":"2026-10-13T20:16:20.924Z","type":"event_msg","payload":{"type":"token_count","rate_limits":' +
  '{"limit_id":"codex","primary":{"used_percent":8.0,"window_minutes":300,"resets_at":1792007501},' +
  '"secondary":{"used_percent":26.0,"window_minutes":10080,"resets_at":1792504391},"plan_type":"plus"}}}'

test('codex limits come from the last rollout line that has them', () => {
  const nullLine = '{"timestamp":"2026-10-13T21:00:00.000Z","payload":{"rate_limits":null}}'
  const found = parseCodexLimits(`${RATE_LINE}\n${nullLine}\n{torn`, 5)
  expect(found).toEqual({
    fiveHour: { pct: 8, resetsAt: 1792007501000 },
    weekly: { pct: 26, resetsAt: 1792504391000 },
    seenAt: Date.parse('2026-10-13T20:16:20.924Z'),
    plan: 'plus',
  })
  expect(parseCodexLimits(nullLine, 5)).toBe(null)
  expect(parseCodexLimits('not json at all', 5)).toBe(null)
  // a window past its reset is empty
  expect(windowPct({ pct: 90, resetsAt: 1000 }, 2000)).toBe(0)
  expect(windowPct(null, 2000)).toBe(null)
  // ...but for routing it is unknown, not zero: Codex may have been used since the reading
  expect(measuredPct({ pct: 90, resetsAt: 1000 }, 2000)).toBe(null)
  expect(measuredPct({ pct: 90, resetsAt: 3000 }, 2000)).toBe(90)
  expect(measuredPct(null, 2000)).toBe(null)
  expect(codexLine(null, 0)).toContain('no data')
  const line = codexLine(found, 1792000000000)
  expect(line).toContain('5h ▱▱▱▱ 8%')
  expect(line).toContain('wk ▰▱▱▱ 26%')
})

test('worker commands are recognised only at the start', () => {
  expect(workerOf('codex exec --sandbox read-only - < task.md')).toBe('codex')
  expect(workerOf('  codex exec -m gpt-6.1-sol -c model_reasoning_effort=high - < t.md')).toBe('codex')
  expect(workerOf('node ~/.claude/delegation/delegate.mjs <<\'EOF\'')).toBe('codex')
  expect(workerOf('node C:/Users/x/.claude/delegation/delegate.mjs task.md')).toBe('codex')
  expect(workerOf('node other.mjs')).toBe(null)
  expect(workerOf('codex login status')).toBe(null)
  // Antigravity and Gemini CLI are no longer workers
  expect(workerOf('agy -p "x"')).toBe(null)
  expect(workerOf('gemini -p "x"')).toBe(null)
  expect(workerOf('echo codex exec')).toBe(null)
  expect(workerOf('codex execute')).toBe(null)
})

test('worker line', () => {
  expect(workerLine(null, null)).toBe('idle')
  expect(workerLine({ name: 'codex', startedAt: new Date(2026, 0, 1, 9, 5).getTime() }, null)).toBe('codex running since 09:05')
  expect(workerLine(null, { name: 'codex', ms: 18000, outcome: 'ok' })).toBe('last codex 18s · ok')
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
  await ui.press({ key: 'route' })
  expect(JSON.parse(files[ROUTING] ?? '').preference).toBe('auto')
})

test('the Codex and Cx eff buttons cycle and write routing.json, keeping its other keys', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12) })
  const files = fakeFiles(on, { [ROUTING]: '{"preference":"codex"}' })
  const ui = await mountBand($)
  expect((await ui.find({ key: 'codexModel' }))?.text).toContain('default')
  await ui.press({ key: 'codexModel' })
  expect((await ui.find({ key: 'codexModel' }))?.text).toContain('6-astra')
  await ui.press({ key: 'codexModel' })
  expect(JSON.parse(files[ROUTING] ?? '')).toEqual({ preference: 'codex', codexModel: 'gpt-6.1-sol' })
  await ui.press({ key: 'codexEffort' })
  expect((await ui.find({ key: 'codexEffort' }))?.text).toContain('low')
  expect(JSON.parse(files[ROUTING] ?? '')).toEqual({ preference: 'codex', codexModel: 'gpt-6.1-sol', codexEffort: 'low' })
})

test('a typed prompt carries the preference the file holds now', async ($, on) => {
  mock.store(on)
  const files = fakeFiles(on, { [ROUTING]: '{"preference":"claude"}' })
  const typed = await $.prompt.submit({ text: 'scan this repo', origin: { kind: 'composer' } } as never)
  expect(typed.context).toEqual([routeContext({ preference: 'claude', codexModel: null, codexEffort: null })])
  files[ROUTING] = '{"preference":"codex","codexEffort":"high"}'
  const again = await $.prompt.submit({ text: 'review it', origin: { kind: 'composer' } } as never)
  expect(again.context).toEqual([routeContext({ preference: 'codex', codexModel: null, codexEffort: 'high' })])
})

test('a missing routing.json reads as auto', async ($, on) => {
  mock.store(on)
  fakeFiles(on, {})
  const typed = await $.prompt.submit({ text: 'hi', origin: { kind: 'composer' } } as never)
  expect(typed.context).toEqual([routeContext({ preference: 'auto', codexModel: null, codexEffort: null })])
})

test('the codex row shows the limits from the newest rollout', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 21) })
  const day = `${HOME}\\.codex\\sessions\\2026\\10\\13`
  fakeFiles(on, {
    [`${day}\\rollout-2026-10-13T14-50-06-a.jsonl`]: `${RATE_LINE}\n`,
    [`${HOME}\\.codex\\sessions\\2026\\10\\12\\rollout-old.jsonl`]: 'nothing here\n',
  })
  // the rollouts are read between turns
  on('session.turns', () => ({ value: 1 }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ answer: '', reason: 'answer' } as never)
  const ui = await mountBand($)
  expect(await ui.find({ text: /5h ▱▱▱▱ 8% · wk ▰▱▱▱ 26%/ })).toBeDefined()
})

test('without Codex sessions the codex row says no data', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 21) })
  fakeFiles(on, {})
  const ui = await mountBand($)
  expect(await ui.find({ text: /no data \(use Codex/ })).toBeDefined()
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


test('prompts stay with Claude even when the engine is set to Codex', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  on('config.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'direct-test-session' }))
  on('session.cwd', () => ({ value: 'D:/project' }))
  on('session.messages', () => ({ value: { deny: 'Context temporarily unavailable' } }))
  let claudeCalls = 0
  on('prompt.submit', ($, e) => { claudeCalls++; return { text: e.text } })
  const run = (args: string) => $.command.run({ command: 'usage-hud', args, origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 120 } })
  expect((await run('engine codex')).text).toContain('Engine: Codex')
  const result = await $.prompt.submit({ text: 'Continue my task.', asUser: true })
  expect(result.drop).toBeUndefined()
  expect(claudeCalls).toBe(1)
})

test('with the Codex engine the Model and Effort buttons and commands drive Codex', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12) })
  on('config.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'switch-session' }))
  on('session.cwd', () => ({ value: 'D:/project' }))
  const files = fakeFiles(on, { [ROUTING]: '{"preference":"claude"}' })
  const run = (args: string) => $.command.run({ command: 'usage-hud', args, origin: { kind: 'composer' }, presentation: { layout: 'main', columns: 120 } } as never)
  expect((await run('engine codex')).text).toContain('Engine: Codex')
  const ui = await mountBand($)
  await ui.press({ key: 'model' })
  expect(JSON.parse(files[ROUTING] ?? '').codexModel).toBe('gpt-6-astra')
  await ui.press({ key: 'effort' })
  expect(JSON.parse(files[ROUTING] ?? '').codexEffort).toBe('low')
  expect((await run('model terra')).text).toContain('gpt-5.6-terra')
  expect(JSON.parse(files[ROUTING] ?? '').codexModel).toBe('gpt-5.6-terra')
  expect((await run('codex 5.6-luna')).text).toContain('gpt-5.6-luna')
  expect((await run('codex high')).text).toContain('high')
  expect(JSON.parse(files[ROUTING] ?? '')).toMatchObject({ preference: 'claude', codexModel: 'gpt-5.6-luna', codexEffort: 'high' })
  expect((await run('codex default')).text).toContain('account default')
  expect((await run('engine claude')).text).toContain('Engine: Claude')
  expect((await run('model sonnet')).text).toContain('sonnet')
})

test('the codex row shows the Saved line from the delegation ledger', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 13, 21) })
  const day = `${HOME}\\.codex\\sessions\\2026\\10\\13`
  const ledger = `${Date.UTC(2026, 9, 13, 21) - 60_000}`
  fakeFiles(on, {
    [`${day}\\rollout-2026-10-13T14-50-06-a.jsonl`]: `${RATE_LINE}\n`,
    [`${HOME}\\.codex\\sessions\\2026\\10\\12\\rollout-old.jsonl`]: 'nothing here\n',
    [`${HOME}\\.claude\\delegation\\runs\\ledger.jsonl`]: `{"at":${ledger},"task":"review","codexTokens":{"input":10000,"output":2000}}\n{broken\n`,
  })
  on('session.turns', () => ({ value: 1 }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ answer: '', reason: 'answer' } as never)
  const ui = await mountBand($)
  expect(await ui.find({ text: /Saved: 12k session · 12k today/ })).toBeDefined()
  expect(await ui.find({ text: /Codex 5h: 8%/ })).toBeDefined()
})
