import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DayTotals, EffortName, GitInfo, Limit, ModelInfo, Tasks, ThemeName, UsageSample } from '../types'

// ---- state ------------------------------------------------------------------

const limits = atom({ plugin: 'usage-hud', key: 'limits' } as const, [] as Limit[])
const model = atom({ plugin: 'usage-hud', key: 'model' } as const, null as ModelInfo | null)
const tasks = atom({ plugin: 'usage-hud', key: 'tasks' } as const, null as Tasks | null)
const durations = atom({ plugin: 'usage-hud', key: 'durations' } as const, [] as number[])
const startedAt = atom({ plugin: 'usage-hud', key: 'startedAt' } as const, {} as Record<string, number>)
const lastMark = atom({ plugin: 'usage-hud', key: 'lastMark' } as const, 0)
const isHidden = atom({ plugin: 'usage-hud', key: 'isHidden' } as const, false)
const theme = atom({ plugin: 'usage-hud', key: 'theme' } as const, 'classic' as ThemeName)
const samples = atom({ plugin: 'usage-hud', key: 'samples' } as const, [] as UsageSample[])
const today = atom({ plugin: 'usage-hud', key: 'today' } as const, null as DayTotals | null)
const costSeen = atom({ plugin: 'usage-hud', key: 'costSeen' } as const, 0)
const context = atom({ plugin: 'usage-hud', key: 'context' } as const, null as number | null)
const contextWindow = atom({ plugin: 'usage-hud', key: 'contextWindow' } as const, null as number | null)
const sessionStart = atom({ plugin: 'usage-hud', key: 'sessionStart' } as const, 0)
const cost = atom({ plugin: 'usage-hud', key: 'cost' } as const, null as number | null)
const turns = atom({ plugin: 'usage-hud', key: 'turns' } as const, 0)
const toolCalls = atom({ plugin: 'usage-hud', key: 'toolCalls' } as const, 0)
const modelOverride = atom({ plugin: 'usage-hud', key: 'modelOverride' } as const, null as string | null)
const effortOverride = atom({ plugin: 'usage-hud', key: 'effortOverride' } as const, null as EffortName | null)
const modeLabel = atom({ plugin: 'usage-hud', key: 'modeLabel' } as const, null as string | null)
const git = atom({ plugin: 'usage-hud', key: 'git' } as const, null as GitInfo | null)

// ---- choices ----------------------------------------------------------------

// ok/warn/bad: fill by usage; accent: names and labels; text: values; track: unfilled ring.
type Theme = { ok: number; warn: number; bad: number; track: number; text: number; accent: number; border: string }

export const THEMES: Record<ThemeName, Theme> = {
  classic: { ok: 0x4ade80, warn: 0xfbbf24, bad: 0xf87171, track: 0x3a3a3a, text: 0xe5e5e5, accent: 0x60a5fa, border: 'gray' },
  nord: { ok: 0xa3be8c, warn: 0xebcb8b, bad: 0xbf616a, track: 0x434c5e, text: 0xeceff4, accent: 0x88c0d0, border: '#4c566a' },
  mocha: { ok: 0xa6e3a1, warn: 0xf9e2af, bad: 0xf38ba8, track: 0x45475a, text: 0xcdd6f4, accent: 0xcba6f7, border: '#585b70' },
  claude: { ok: 0xd77757, warn: 0xf2c14e, bad: 0xe05d5d, track: 0x3b2a24, text: 0xf5e6d8, accent: 0xd77757, border: '#d77757' },
}
const THEME_NAMES = Object.keys(THEMES) as ThemeName[]

export const MODELS = [
  { label: 'opus 5.5', id: 'claude-opus-5-5' },
  { label: 'sonnet 5.5', id: 'claude-sonnet-5-5' },
  { label: 'haiku 5.5', id: 'claude-haiku-5-5' },
  { label: 'fable 5.1', id: 'claude-fable-5-1' },
] as const
const MODEL_IDS: readonly string[] = MODELS.map(m => m.id)

export const EFFORTS: readonly EffortName[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const isThemeName = (name: string): name is ThemeName => name in THEMES
const isEffort = (name: string): name is EffortName => (EFFORTS as readonly string[]).includes(name)

/** The next theme, wrapping around. */
export const nextTheme = (name: ThemeName): ThemeName =>
  THEME_NAMES[(THEME_NAMES.indexOf(name) + 1) % THEME_NAMES.length] ?? 'classic'

/** The next value after `current`; null ("auto", no override) closes the cycle. */
export const cycle = <T,>(list: readonly T[], current: T | null): T | null => {
  if (current === null) return list[0] ?? null
  const at = list.indexOf(current)
  return at < 0 || at === list.length - 1 ? null : (list[at + 1] ?? null)
}

/** A known model by alias (opus), label (opus 5.5) or id; anything else is refused. */
export const findModel = (text: string): string | undefined => {
  const t = text.trim().toLowerCase()
  return MODELS.find(m => m.id === t || m.label === t || m.label.split(' ')[0] === t)?.id
}

export const modelButton = (id: string | null): string =>
  id === null ? 'auto' : (MODELS.find(m => m.id === id)?.label ?? id.replace(/^claude-/, ''))

// ---- formatting -------------------------------------------------------------

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')

export const fillColor = (pct: number, t: Theme) => (pct < 60 ? t.ok : pct < 85 ? t.warn : t.bad)

/** Border colour: the theme's own, amber from 85%, red from 95%. */
export const borderFor = (maxPct: number, t: Theme): string =>
  maxPct >= 95 ? hex(t.bad) : maxPct >= 85 ? hex(t.warn) : t.border

export const bar = (fraction: number, width = 8): string => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const BLOCKS = '▁▂▃▄▅▆▇█'
export const sparkline = (values: number[]): string =>
  values.map(v => BLOCKS.charAt(Math.min(7, Math.max(0, Math.floor((v / 100) * 8))))).join('')

/** Minutes as "5m", "2h 10m" or "3d 4h". */
const duration = (mins: number): string => {
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const uptime = (since: number, now: number): string =>
  duration(Math.max(0, Math.floor((now - since) / 60000)))

export const resetsIn = (resetsAt: string | undefined, now: number): string => {
  const ms = resetsAt ? Date.parse(resetsAt) - now : NaN
  return Number.isFinite(ms) ? `resets in ${duration(Math.max(0, Math.round(ms / 60000)))}` : 'resets in --'
}

export const formatEta = (ms: number): string => `~${duration(Math.max(1, Math.round(ms / 60000)))}`

/**
 * When the 5h window runs out at the pace of the last 90 minutes, against when it resets.
 * `isRisk` is true when the limit comes first.
 */
export const pace = (
  history: readonly UsageSample[],
  resetsAt: string | undefined,
  now: number,
): { text: string; isRisk: boolean } => {
  const last = history.at(-1)
  if (!last) return { text: 'pace --', isRisk: false }
  if (last.pct >= 100) return { text: 'limit reached', isRisk: true }
  const first = history.find(x => now - x.t <= 90 * 60000)
  if (!first || first === last || last.pct <= first.pct) return { text: 'pace steady', isRisk: false }
  const toLimit = ((100 - last.pct) * (last.t - first.t)) / (last.pct - first.pct)
  const toReset = resetsAt ? Date.parse(resetsAt) - now : Infinity
  return toLimit >= toReset
    ? { text: 'safe till reset', isRisk: false }
    : { text: `limit in ${formatEta(toLimit)}`, isRisk: true }
}

/** The local calendar day of `ms`, as YYYY-MM-DD. */
export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const clockTime = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const money = (usd: number | null): string =>
  usd === null ? '$--' : `$${usd.toFixed(usd < 10 ? 2 : 1)}`

export const tokensLabel = (n: number): string =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`

export const prettyModel = (id: string): string =>
  id
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-(\d+)-(\d+)$/, ' $1.$2')
    .replace(/-(\d+)$/, ' $1')
    .replace(/-/g, ' ')

// ---- donut ------------------------------------------------------------------

const DEFAULT = 0x01000000 // the terminal's own colour
const COLS = 10
const ROWS = 5 // two pixels per row, so a 10x10 pixel grid

// Own base64 encoder: bytes in, standard padded base64 out.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export const base64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '='
  }
  return out
}

/** Colour of pixel (x, y): DEFAULT outside the ring, else fill or track. */
const pixel = (x: number, y: number, pct: number | null, t: Theme): number => {
  const dx = x + 0.5 - COLS / 2
  const dy = y + 0.5 - COLS / 2
  const dist = Math.hypot(dx, dy)
  if (dist > COLS / 2 || dist < (COLS / 2) * 0.6) return DEFAULT
  if (pct === null) return t.track
  const turn = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1 // clockwise from 12 o'clock
  return turn * 100 < pct ? fillColor(pct, t) : t.track
}

/** The donut as Raster cells, the percentage written in the hole. */
export const donutCells = (pct: number | null, t: Theme): string => {
  const label = pct === null ? '--' : `${Math.round(pct)}%`
  const start = Math.floor((COLS - label.length) / 2)
  const words = new Uint32Array(COLS * ROWS * 3)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const top = pixel(col, row * 2, pct, t)
      const bottom = pixel(col, row * 2 + 1, pct, t)
      const inLabel = row === Math.floor(ROWS / 2) && col >= start && col < start + label.length
      // ▀ paints the top pixel as foreground over the bottom as background; ▄ the reverse.
      const cell = inLabel
        ? [label.charCodeAt(col - start), t.text, DEFAULT]
        : top === DEFAULT && bottom === DEFAULT
          ? [0x20, DEFAULT, DEFAULT]
          : top === DEFAULT
            ? [0x2584, bottom, DEFAULT]
            : [0x2580, top, bottom]
      words.set(cell, (row * COLS + col) * 3)
    }
  }
  return base64(new Uint8Array(words.buffer))
}

// ---- host reads -------------------------------------------------------------

const readGit = async ($: EngineInterface): Promise<GitInfo | null> => {
  try {
    const head = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    if (head.exitCode !== 0) return null
    const status = await $.process.run(['git', 'status', '--porcelain'])
    return { branch: head.stdout.trim(), dirty: status.stdout.trim().length > 0 }
  } catch {
    return null
  }
}

/** The /config row holding the permission mode: the choice offering plan / acceptEdits. */
const findModeRow = async ($: Pick<EngineInterface, 'config'>) => {
  try {
    return (await $.config.list()).find(r => r.options?.some(o => /plan|acceptEdits/i.test(o)))
  } catch {
    return undefined
  }
}

/** Re-reads git, the turn count and the mode: things that change between turns. */
const refreshBetweenTurns = async ($: EngineInterface) => {
  const [info, count, row] = await Promise.all([readGit($), $.session.turns(), findModeRow($)])
  await update($, git, () => info)
  await update($, turns, () => count)
  await update($, modeLabel, current => (row ? String(row.value) : current))
}

/** Adds to today's totals in the store (shared by every session), starting a new day when the date moved. */
const addToday = async ($: EngineInterface, add: { cost?: number; turns?: number }) => {
  const now = await $.clock.now()
  const saved = (await $.store.get('today')) as DayTotals | undefined
  const base = saved?.date === dayKey(now) ? saved : { date: dayKey(now), cost: 0, turns: 0 }
  const next = { date: base.date, cost: base.cost + (add.cost ?? 0), turns: base.turns + (add.turns ?? 0) }
  await $.store.set('today', next)
  await update($, today, () => next)
}

// ---- settings changes (shared by the buttons and the command) --------------

const setTheme = async ($: EngineInterface, name: ThemeName) => {
  await update($, theme, () => name)
  await $.store.set('theme', name)
}

const setModel = async ($: EngineInterface, id: string | null) => {
  await update($, modelOverride, () => id)
  await $.store.set('modelOverride', id)
}

const setEffort = async ($: EngineInterface, level: EffortName | null) => {
  await update($, effortOverride, () => level)
  await $.store.set('effortOverride', level)
}

/** Sets the mode, or the next one when `pick` is absent; answers with what happened. */
const setMode = async ($: EngineInterface, pick?: string): Promise<string> => {
  const row = await findModeRow($)
  const options = row?.options ?? []
  if (!row || options.length === 0) return 'The permission mode cannot be changed from a mod here; use shift+tab.'
  const value = pick ?? options[(options.indexOf(String(row.value)) + 1) % options.length]
  if (value === undefined || !options.includes(value)) return `Unknown mode. Options: ${options.join(', ')}.`
  const set = await $.config.set({ key: row.key, value })
  if (set.deny !== undefined) return `Mode not changed: ${set.deny}`
  await update($, modeLabel, () => value)
  return `Mode: ${value}.`
}

// ---- hooks ------------------------------------------------------------------

type Todo = { content: string; status: string; activeForm: string }

const USAGE = `Usage: /usage-hud [theme <${THEME_NAMES.join('|')}> | model <opus|sonnet|haiku|fable|auto> | effort <${EFFORTS.join('|')}|auto> | mode [name]]`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-hud',
      description: 'Toggle the usage HUD; or set theme, model, effort or mode',
      argumentHint: '[theme|model|effort|mode] [value]',
    })

    try {
      const [savedTheme, savedModel, savedEffort, savedHidden] = await Promise.all([
        $.store.get('theme'),
        $.store.get('modelOverride'),
        $.store.get('effortOverride'),
        $.store.get('isHidden'),
      ])
      if (typeof savedTheme === 'string' && isThemeName(savedTheme)) await update($, theme, () => savedTheme)
      if (typeof savedModel === 'string' && MODEL_IDS.includes(savedModel)) await update($, modelOverride, () => savedModel)
      if (typeof savedEffort === 'string' && isEffort(savedEffort)) await update($, effortOverride, () => savedEffort)
      if (typeof savedHidden === 'boolean') await update($, isHidden, () => savedHidden)
    } catch {
      // settings keep their defaults when the store cannot be read
    }

    try {
      const usage = await $.session.usage()
      await update($, limits, () => usage.rateLimits)
      await update($, context, () => usage.context.percent ?? null)
      await update($, contextWindow, () => usage.context.window)
      await update($, cost, () => usage.cost?.usd ?? null)
      await update($, costSeen, () => usage.cost?.usd ?? 0)
      await update($, sessionStart, () => usage.startedAt)
    } catch {
      // no reading yet: the rings show "no data"
    }

    await addToday($, {})
    await refreshBetweenTurns($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, limits, () => e.rateLimits)
    await update($, context, () => e.context.percent ?? null)
    await update($, contextWindow, () => e.context.window)
    const usd = e.cost?.usd
    if (usd !== undefined) {
      const seen = await read($, costSeen)
      await update($, cost, () => usd)
      await update($, costSeen, () => usd)
      if (usd > seen) await addToday($, { cost: usd - seen })
    }
    const five = e.rateLimits.find(l => l.kind === 'five_hour')
    if (five) {
      const sample = { t: await $.clock.now(), pct: five.percentUsed }
      await update($, samples, list => {
        const last = list.at(-1)
        if (last && sample.pct < last.pct) return [sample] // the window reset: start over
        return last?.pct === sample.pct ? list : [...list, sample].slice(-30)
      })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await refreshBetweenTurns($)
      await addToday($, { turns: 1 })
    }
    return next(e)
  })

  // Main thread only: apply the chosen model and effort, and record what each request used.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const [pickedModel, pickedEffort] = await Promise.all([read($, modelOverride), read($, effortOverride)])
    const step = {
      ...e,
      ...(pickedModel === null ? {} : { model: pickedModel }),
      // a model without effort gets none: forcing one would be refused
      ...(pickedEffort === null || e.effort === undefined ? {} : { effort: pickedEffort }),
    }
    await update($, model, () => ({ model: step.model, effort: step.effort ?? null }))
    return yield* next(step)
  })

  on('tool.call', async ($, e, next) => {
    try {
      await update($, toolCalls, n => n + 1)
    } catch {
      // counting must never block a tool call
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    try {
      const todos = (e.todos ?? []) as Todo[]
      const now = await $.clock.now()
      const completed = todos.filter(t => t.status === 'completed')
      const active = todos.find(t => t.status === 'in_progress')
      const prev = await read($, tasks)

      // A new list: completed dropped, or the total changed while nothing is done.
      const isNewList =
        prev === null ||
        completed.length < prev.completed ||
        (completed.length === 0 && todos.length !== prev.total)

      let times = isNewList ? [] : await read($, durations)
      let starts = isNewList ? {} : await read($, startedAt)
      let mark = isNewList ? now : await read($, lastMark)

      const finished = isNewList ? 0 : completed.length - prev.completed
      if (finished > 0) {
        // a task's duration runs from when it went in progress, else from the last finish
        const durationsNow = completed.slice(-finished).map(t => Math.max(0, now - (starts[t.content] ?? mark)))
        times = [...times, ...durationsNow].slice(-5)
        mark = now
      }
      if (active && starts[active.content] === undefined) starts = { ...starts, [active.content]: now }

      await update($, durations, () => times)
      await update($, startedAt, () => starts)
      await update($, lastMark, () => mark)
      await update($, tasks, () => ({
        total: todos.length,
        completed: completed.length,
        current: active?.activeForm ?? null,
      }))
    } catch {
      // the HUD must never get in the way of the tool call
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'usage-hud' }, async ($, e) => {
    const [sub, ...rest] = e.args.trim().toLowerCase().replace(/[:=]/g, ' ').split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    const isAuto = arg === 'auto' || arg === 'default'

    if (sub === undefined) {
      const hidden = !(await read($, isHidden))
      await update($, isHidden, () => hidden)
      await $.store.set('isHidden', hidden)
      return { text: hidden ? 'Usage HUD hidden.' : 'Usage HUD shown.' }
    }
    if (sub === 'theme' && isThemeName(arg)) {
      await setTheme($, arg)
      return { text: `Usage HUD theme: ${arg}.` }
    }
    if (sub === 'model' && (isAuto || findModel(arg))) {
      const id = isAuto ? null : (findModel(arg) ?? null)
      await setModel($, id)
      return { text: `Model: ${id === null ? 'session default' : modelButton(id)} (from the next request).` }
    }
    if (sub === 'effort' && (isAuto || isEffort(arg))) {
      const level = isEffort(arg) ? arg : null
      await setEffort($, level)
      return { text: `Effort: ${level ?? 'session default'} (from the next request).` }
    }
    if (sub === 'mode') {
      if (arg !== '') return { text: await setMode($, arg) }
      const row = await findModeRow($)
      return {
        text: row
          ? `Mode: ${String(row.value)}. Options: ${(row.options ?? []).join(', ')}.`
          : 'The permission mode cannot be listed from a mod here; use shift+tab.',
      }
    }
    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Text, Raster, Button } = $.ui.resolve(e)
    const [now, all, info, t, times, themeName, trend, ctx, ctxWindow, branch, began, spent] = await Promise.all([
      $.clock.now(),
      read($, limits),
      read($, model),
      read($, tasks),
      read($, durations),
      read($, theme),
      read($, samples),
      read($, context),
      read($, contextWindow),
      read($, git),
      read($, sessionStart),
      read($, cost),
    ])
    const [pickedModel, pickedEffort, mode, turnCount, toolCount, day] = await Promise.all([
      read($, modelOverride),
      read($, effortOverride),
      read($, modeLabel),
      read($, turns),
      read($, toolCalls),
      read($, today),
    ])
    const th = THEMES[themeName]
    // One look for every "name  value" pair: accent name padded to a column, bright value.
    const name = (text: string, width: number) => <Text color={hex(th.accent)}>{text.padEnd(width)}</Text>
    const value = (text: string) => <Text bold color={hex(th.text)}>{text}</Text>
    // Three rings need room: the info and controls columns sit beside them from 135 columns.
    const isWide = e.props.bodyColumns >= 135

    const limitRing = (label: string, kind: string) => {
      const limit = all.find(l => l.kind === kind)
      return { label, kind, pct: limit?.percentUsed ?? null, note: resetsIn(limit?.resetsAt, now), resetsAt: limit?.resetsAt }
    }
    const rings = [
      limitRing('5h limit', 'five_hour'),
      limitRing('7 day limit', 'seven_day'),
      {
        label: 'context',
        kind: 'context',
        pct: ctx,
        note: `of ${ctxWindow === null ? '--' : tokensLabel(ctxWindow)} tokens`,
        resetsAt: undefined,
      },
    ]
    const maxPct = Math.max(0, ...all.map(l => l.percentUsed))
    const forecast = pace(trend, rings[0]?.resetsAt, now)
    const canCompact = ctx !== null && ctx >= 80

    const modelLine = [
      info ? prettyModel(info.model) : 'model unknown',
      ...(info ? [`${info.effort ?? 'default'} effort`] : []),
      branch ? `⎇ ${branch.branch}${branch.dirty ? '*' : ''}` : '⎇ no repo',
    ].join(' · ')

    let taskLine = 'no task list yet'
    if (t !== null) {
      const left = t.total - t.completed
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
      const eta = left === 0 ? 'all tasks done' : avg === 0 ? 'estimating…' : `ETA ${formatEta(avg * left)}`
      const current = t.current === null ? '' : ` · ▸ ${t.current}`
      taskLine = `${bar(t.total === 0 ? 0 : t.completed / t.total, 6)} ${left} of ${t.total} left · ${eta}${current}`
    }

    const sessionLine = [
      money(spent),
      `${turnCount} ${turnCount === 1 ? 'turn' : 'turns'}`,
      `${toolCount} tools`,
      ...(began > 0 ? [`⏱ ${uptime(began, now)}`] : []),
    ].join(' · ')
    const dayTurns = day?.turns ?? 0
    const todayLine = [
      money(day?.cost ?? null),
      `${dayTurns} ${dayTurns === 1 ? 'turn' : 'turns'}`,
      `◷ ${clockTime(now)}`,
    ].join(' · ')

    const controls = [
      { key: 'theme', name: 'Theme', value: themeName, onPress: () => setTheme($, nextTheme(themeName)) },
      {
        key: 'model',
        name: 'Model',
        value: modelButton(pickedModel),
       
        onPress: () => setModel($, cycle(MODEL_IDS, pickedModel)),
      },
      {
        key: 'effort',
        name: 'Effort',
        value: pickedEffort ?? 'auto',
       
        onPress: () => setEffort($, cycle(EFFORTS, pickedEffort)),
      },
      {
        key: 'mode',
        name: 'Mode',
        value: mode ?? '--',
       
        onPress: async () => {
          const result = await setMode($)
          if (!result.startsWith('Mode: ')) $.ui.toast(result)
        },
      },
    ]

    return (
      <Box borderStyle="round" borderColor={borderFor(maxPct, th)} paddingX={1} flexDirection={isWide ? 'row' : 'column'}>
        <Box flexDirection="row">
          {rings.map((r, i) => (
            <Box key={r.kind} flexDirection="row" marginRight={i < rings.length - 1 ? 2 : 0}>
              <Raster key={`donut-${r.kind}`} columns={COLS} rows={ROWS} cells={donutCells(r.pct, th)} />
              <Box flexDirection="column" marginLeft={1}>
                <Text bold>{r.label}</Text>
                <Text color={r.pct === null ? 'gray' : hex(fillColor(r.pct, th))}>
                  {r.pct === null ? 'no data' : `${Math.round(r.pct)}% used`}
                </Text>
                <Text dimColor>{r.note}</Text>
                {r.kind === 'five_hour' && (
                  <Text>
                    {trend.length > 1 && <Text color={hex(th.ok)}>{`${sparkline(trend.slice(-8).map(x => x.pct))} `}</Text>}
                    <Text color={forecast.isRisk ? hex(th.warn) : undefined} dimColor={!forecast.isRisk}>
                      {forecast.text}
                    </Text>
                  </Text>
                )}
                {r.kind === 'context' && canCompact && (
                  <Button
                    key="compact"
                    label="Compact now"
                    plain
                    onPress={async () => {
                      const result = await $.session.compact()
                      if (result.skip !== undefined) $.ui.toast(`Not compacted: ${result.skip}`)
                    }}
                  >
                    <Text bold color={hex(th.warn)}>⟳ compact now</Text>
                  </Button>
                )}
              </Box>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" marginLeft={isWide ? 2 : 0} flexGrow={1}>
          <Text dimColor bold>NOW</Text>
          <Text>
            {name('model', 8)}
            {value(modelLine)}
          </Text>
          <Text wrap="truncate-end">
            {name('tasks', 8)}
            {taskLine}
          </Text>
          <Text>
            {name('session', 8)}
            {sessionLine}
          </Text>
          <Text>
            {name('today', 8)}
            {todayLine}
          </Text>
        </Box>

        <Box flexDirection={isWide ? 'column' : 'row'} marginLeft={isWide ? 2 : 0} paddingLeft={isWide ? 1 : 0}>
          {isWide && <Text dimColor bold>CONTROLS</Text>}
          {controls.map(c => (
            <Box key={c.key} marginRight={isWide ? 0 : 1}>
              <Button key={c.key} label={`${c.name}: ${c.value}`} plain onPress={c.onPress}>
                {name(c.name, 7)}
                {value(c.value)}
              </Button>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
