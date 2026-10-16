import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { loadDirect, selectEngine, runDirect } from './direct'
import type { Engine } from './direct'
import { codexTone, parseLedger, savedParts, totalsFor } from './savings'
import type { SavingsTotals, SessionScope } from './savings'

import type {
  CodexLimits,
  CodexWindow,
  DayTotals,
  EffortName,
  GitInfo,
  Limit,
  ModelInfo,
  RouteName,
  Tasks,
  ThemeName,
  UsageSample,
  WorkerDone,
  WorkerName,
  WorkerRun,
} from '../types'

let directBusy = false
const directEngine = atom({ plugin: 'usage-hud', key: 'directEngine' } as const, 'claude' as Engine)
const directStatus = atom({ plugin: 'usage-hud', key: 'directStatus' } as const, '' as string)

/** A manual switch is the user's choice: autopilot must not flip it back (to Claude: until the limit drops below 50%). */
async function switchEngine($: EngineInterface, engine: Engine, manual = false) {
  if (directBusy) return 'Codex is still working. Stop or finish that request before switching engines.'
  const message = await selectEngine($, engine)
  await update($, directEngine, () => engine)
  await update($, directStatus, () => '')
  if (manual) {
    await setAutoSwitched($, false)
    await update($, switchSuppressed, () => engine === 'claude')
  }
  return message
}

const setAutoSwitched = async ($: EngineInterface, value: boolean) => {
  await update($, autoSwitched, () => value)
  await $.store.set('autoSwitched', value) // survives a restart, so the way back to Claude is not lost
}

/** Percent used of a Claude limit now: a window whose reset has passed is empty (the reading may be stale in Codex mode). */
const limitPct = (l: Limit, now: number): number =>
  l.resetsAt !== undefined && Date.parse(l.resetsAt) <= now ? 0 : l.percentUsed

/** The 5h window alone: the engine switch balances short bursts, so a high weekly total must not pin Codex. */
const fiveHourPct = (list: readonly Limit[], now: number): number =>
  Math.max(0, ...list.filter(l => l.kind === 'five_hour').map(l => limitPct(l, now)))

/** The current readings for the routing block, or undefined when nothing has been measured yet. */
const readUsage = async ($: EngineInterface): Promise<UsageReading | undefined> => {
  try {
    const now = await $.clock.now()
    const [list, cx] = await Promise.all([read($, limits), read($, codexLimits)])
    const of = (kind: string) => {
      const l = list.find(x => x.kind === kind)
      return l === undefined ? null : limitPct(l, now)
    }
    const u: UsageReading = {
      claude5h: of('five_hour'),
      claudeWk: of('seven_day'),
      codex5h: cx === null ? null : measuredPct(cx.fiveHour, now),
      codexWk: cx === null ? null : measuredPct(cx.weekly, now),
    }
    return Object.values(u).every(v => v === null) ? undefined : u
  } catch {
    return undefined // a missing reading must never block a prompt
  }
}

/** Flips to Codex when Claude's limits run high and Codex has room, and back once the 5h window falls 10 points under the trigger. */
async function autoEngine($: EngineInterface, pct: number) {
  const cfg = await read($, autoConfig)
  if (cfg.switchThreshold <= 0 || directBusy) return
  const now = await $.clock.now()
  const [switched, suppressed, engine, cx] = await Promise.all([read($, autoSwitched), read($, switchSuppressed), read($, directEngine), read($, codexLimits)])
  // Back to Claude 10 points under the trigger (the 5h reset normally does it), so it cannot flap at the line.
  const back = Math.max(5, cfg.switchThreshold - 10)
  if (pct < back && suppressed) await update($, switchSuppressed, () => false)
  if (!switched && !suppressed && engine === 'claude' && pct >= cfg.switchThreshold) {
    // Unknown Codex capacity is not free capacity: only switch on a reading.
    const cxKnown = cx === null ? [] : [measuredPct(cx.fiveHour, now), measuredPct(cx.weekly, now)].filter((p): p is number => p !== null)
    if (cxKnown.length === 0) return void $.ui.toast(`Auto-pilot: Claude at ${Math.round(pct)}%, but Codex usage is unknown — staying on Claude`)
    const cxPct = Math.max(...cxKnown)
    if (cxPct >= 95) return void $.ui.toast(`Auto-pilot: Claude at ${Math.round(pct)}%, but Codex is at ${Math.round(cxPct)}% too — staying on Claude`)
    await switchEngine($, 'codex')
    await setAutoSwitched($, true)
    $.ui.toast(`⚡ Auto-pilot: engine → Codex, read-only (Claude at ${Math.round(pct)}%)`)
  } else if (switched && pct < back) {
    if (engine === 'codex') await switchEngine($, 'claude')
    await setAutoSwitched($, false)
    $.ui.toast('✅ Auto-pilot: Claude limit reset — engine → Claude')
  }
}

const isAutoOn = (c: { switchThreshold: number; downgradeEnabled: boolean; compactThreshold: number; fallbackEnabled: boolean }) =>
  c.switchThreshold > 0 || c.downgradeEnabled || c.compactThreshold > 0 || c.fallbackEnabled

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
const route = atom({ plugin: 'usage-hud', key: 'route' } as const, 'auto' as RouteName)
const worker = atom({ plugin: 'usage-hud', key: 'worker' } as const, null as WorkerRun | null)
const lastWorker = atom({ plugin: 'usage-hud', key: 'lastWorker' } as const, null as WorkerDone | null)
const codexModel = atom({ plugin: 'usage-hud', key: 'codexModel' } as const, null as string | null)
const codexEffort = atom({ plugin: 'usage-hud', key: 'codexEffort' } as const, null as EffortName | null)
const codexLimits = atom({ plugin: 'usage-hud', key: 'codexLimits' } as const, null as CodexLimits | null)
const savings = atom({ plugin: 'usage-hud', key: 'savings' } as const, null as SavingsTotals | null)
const savingsScope = atom({ plugin: 'usage-hud', key: 'savingsScope' } as const, null as SessionScope | null)

// ---- autopilot config -------------------------------------------------------

type AutoConfig = {
  switchThreshold: number    // 0 = disabled; auto-switch engine to codex at this 5h %
  downgradeEnabled: boolean  // auto-downgrade model at thresholds (opus→sonnet@70%, →haiku@85%)
  compactThreshold: number   // 0 = disabled; auto-compact context at this %
  fallbackEnabled: boolean   // auto-route to codex when claude hits 100%
}
const DEFAULT_AUTO: AutoConfig = { switchThreshold: 50, downgradeEnabled: true, compactThreshold: 85, fallbackEnabled: true }
const autoConfig = atom({ plugin: 'usage-hud', key: 'autoConfig' } as const, { ...DEFAULT_AUTO })
const autoSwitched = atom({ plugin: 'usage-hud', key: 'autoSwitched' } as const, false)
const switchSuppressed = atom({ plugin: 'usage-hud', key: 'switchSuppressed' } as const, false)
const COMPACT_TOKENS = 150_000 // auto-compact above this many context tokens, whatever the window size
const IDLE_CACHE_MS = 55 * 60_000 // the prompt cache lapses after about an hour idle; the next call then re-writes the whole context
const IDLE_WARN_TOKENS = 60_000
let lastTurnAt = 0
const autoOrigModel = atom({ plugin: 'usage-hud', key: 'autoOrigModel' } as const, null as string | null)
const autoDownDisabled = atom({ plugin: 'usage-hud', key: 'autoDownDisabled' } as const, false)
const autoCompacted = atom({ plugin: 'usage-hud', key: 'autoCompacted' } as const, false)

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

// ---- delegation routing -----------------------------------------------------
// Whether Claude delegates to the Codex worker CLI, and with which model and effort.
// It never changes Claude's own model.

export const ROUTES: readonly RouteName[] = ['auto', 'claude', 'codex']

export const isRoute = (x: unknown): x is RouteName => typeof x === 'string' && (ROUTES as readonly string[]).includes(x)

export const nextRoute = (r: RouteName): RouteName => ROUTES[(ROUTES.indexOf(r) + 1) % ROUTES.length] ?? 'auto'

// The models this Codex account has run; null, the account default (gpt-6-astra here), closes the cycle.
export const CODEX_MODELS = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const
const CODEX_MODEL_IDS: readonly string[] = CODEX_MODELS

export const codexModelButton = (id: string | null): string => (id === null ? 'default' : id.replace(/^gpt-/, ''))

/** "gpt-5.6-sol", "5.6-sol" or a unique fragment such as "terra" resolves to a listed Codex model. */
export const findCodexModel = (text: string): string | undefined => {
  const t = text.trim().toLowerCase()
  if (t === '') return undefined
  const exact = CODEX_MODEL_IDS.find(id => id === t || id.replace(/^gpt-/, '') === t)
  if (exact) return exact
  const partial = CODEX_MODEL_IDS.filter(id => id.includes(t))
  return partial.length === 1 ? partial[0] : undefined
}

export type Routing = { preference: RouteName; codexModel: string | null; codexEffort: EffortName | null }

/** routing.json's values; a missing, unreadable or unknown value reads as auto / default. */
export const parseRouting = (text: string | undefined): Routing => {
  let parsed: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(text ?? '')
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch {
    // read as all defaults
  }
  const { preference, codexModel: m, codexEffort: eff } = parsed
  return {
    preference: isRoute(preference) ? preference : 'auto',
    // any model id Codex may know is kept, not only the listed ones
    codexModel: typeof m === 'string' && /^[\w.-]+$/.test(m) ? m : null,
    codexEffort: typeof eff === 'string' && isEffort(eff) ? eff : null,
  }
}

export const parseRoute = (text: string | undefined): RouteName => parseRouting(text).preference

/** routing.json's text with `patch` merged in and every other key kept. */
export const withRouting = (text: string | undefined, patch: Partial<Routing>): string => {
  let base: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text ?? '')
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed as Record<string, unknown>
  } catch {
    // a broken file is replaced by a fresh one
  }
  return `${JSON.stringify({ ...base, ...patch }, null, 2)}\n`
}

/** The worker a Bash command starts: it must begin with `codex exec`. */
export const workerOf = (command: string): WorkerName | null =>
  /^\s*(?:codex\s+exec\b|node\s+\S*delegate\.mjs\b)/.test(command) ? 'codex' : null

/** What the model reads beside each typed prompt. */
export const routeContext = ({ preference, codexModel: m, codexEffort: eff }: Routing, usage?: UsageReading): string =>
  `[delegation-routing] preference=${preference} codexModel=${m ?? 'default'} codexEffort=${eff ?? 'default'}. ` +
  (usage === undefined ? '' : `${usageLine(usage)} `) +
  `Codex routing only, not Claude's model. Rules: ~/.claude/CLAUDE.md.`

/** Percent used per window, null where there is no reading. */
export type UsageReading = { claude5h: number | null; claudeWk: number | null; codex5h: number | null; codexWk: number | null }

/**
 * Pressure on Claude: the fuller of its two windows. low under 60%, medium under 85%, high above.
 * A missing window can hide an exhausted one, so it only ever rules out "low": the answer is then unknown.
 */
export const pressureOf = ({ claude5h, claudeWk }: UsageReading): 'low' | 'medium' | 'high' | 'unknown' => {
  const known = [claude5h, claudeWk].filter((p): p is number => p !== null)
  if (known.length === 0) return 'unknown'
  const top = Math.max(...known)
  if (top >= 85) return 'high'
  if (known.length < 2) return 'unknown'
  return top < 60 ? 'low' : 'medium'
}

const usageLine = (u: UsageReading): string => {
  const pct = (p: number | null) => (p === null ? '?' : `${Math.round(p)}%`)
  return `usage claude5h=${pct(u.claude5h)} claudeWeek=${pct(u.claudeWk)} codex5h=${pct(u.codex5h)} codexWeek=${pct(u.codexWk)} pressure=${pressureOf(u)}.`
}

// ---- Codex usage ------------------------------------------------------------
// Codex records its limits in each session's rollout file. `codex exec --ephemeral` (Claude's worker
// calls) writes none, so this is the reading of the last Codex app or CLI session.

/**
 * The last `rate_limits` with data in a rollout's text: primary is the 5h window, secondary the weekly one.
 * `seenAt` is the line's own timestamp, else `fallbackAt` (the file's mtime).
 */
export const parseCodexLimits = (text: string, fallbackAt: number): CodexLimits | null => {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (!line.includes('"rate_limits":{')) continue
    try {
      const event: unknown = JSON.parse(line)
      const found = findRateLimits(event)
      const stamp = Date.parse(String((event as { timestamp?: unknown }).timestamp))
      const seenAt = Number.isFinite(stamp) ? stamp : fallbackAt
      if (!found) continue
      const win = (w: unknown): CodexWindow | null => {
        const x = w as { used_percent?: unknown; resets_at?: unknown } | null
        return x && typeof x.used_percent === 'number' && typeof x.resets_at === 'number'
          ? { pct: x.used_percent, resetsAt: x.resets_at * 1000 }
          : null
      }
      const limits = { fiveHour: win(found.primary), weekly: win(found.secondary) }
      if (limits.fiveHour === null && limits.weekly === null) continue
      return { ...limits, seenAt, plan: typeof found.plan_type === 'string' ? found.plan_type : null }
    } catch {
      // a torn last line: look further up
    }
  }
  return null
}

type RateLimits = { primary?: unknown; secondary?: unknown; plan_type?: unknown }
const findRateLimits = (node: unknown): RateLimits | null => {
  if (node === null || typeof node !== 'object') return null
  const rl = (node as { rate_limits?: unknown }).rate_limits
  if (rl !== null && typeof rl === 'object') return rl as RateLimits
  for (const child of Object.values(node)) {
    const found = findRateLimits(child)
    if (found) return found
  }
  return null
}

/** Percent used now: a window whose reset has passed is empty. */
export const windowPct = (w: CodexWindow | null, now: number): number | null =>
  w === null ? null : w.resetsAt <= now ? 0 : w.pct

/** What was actually measured: a window that has reset since the reading is unknown (Codex may have been used since), not 0. */
export const measuredPct = (w: CodexWindow | null, now: number): number | null =>
  w === null || w.resetsAt <= now ? null : w.pct

/** The NOW row for Codex: both windows, and when they were read. */
export const codexLine = (limits: CodexLimits | null, now: number): string => {
  if (limits === null) return 'no data (use Codex once to see its limits)'
  const part = (label: string, w: CodexWindow | null) => {
    const pct = windowPct(w, now)
    return pct === null ? `${label} --` : `${label} ${bar(pct / 100, 4)} ${Math.round(pct)}%`
  }
  return `${part('5h', limits.fiveHour)} · ${part('wk', limits.weekly)} · as of ${clockTime(limits.seenAt)}`
}

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

/** A short span: "42s" under a minute, else as `duration`. */
export const shortSpan = (ms: number): string =>
  ms < 60000 ? `${Math.max(0, Math.round(ms / 1000))}s` : duration(Math.round(ms / 60000))

/** The NOW row for workers: what is running, else how the last call ended, else idle. */
export const workerLine = (running: WorkerRun | null, last: WorkerDone | null): string =>
  running
    ? `${running.name} running since ${clockTime(running.startedAt)}`
    : last
      ? `last ${last.name} ${shortSpan(last.ms)} · ${last.outcome}`
      : 'idle'

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

const homeDir = async ($: EngineInterface): Promise<string | null> => {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? home.replace(/[\\/]+$/, '') : null
}

/** ~/.claude/delegation/routing.json, shared with route.mjs and read by CLAUDE.md's rules; null without a home. */
const routingPath = async ($: EngineInterface): Promise<string | null> => {
  const home = await homeDir($)
  return home ? `${home}/.claude/delegation/routing.json` : null
}

const MAX_READ = 4 * 1024 * 1024 // $.fs.read rejects anything larger

/** Entries of a directory, newest name first (dates sort as text); [] when it cannot be listed. */
const listDesc = async ($: EngineInterface, path: string, kind: 'file' | 'dir') => {
  try {
    return (await $.fs.list(path)).filter(x => x.kind === kind).sort((a, b) => b.name.localeCompare(a.name))
  } catch {
    return []
  }
}

// What each rollout held at the mtime it was read, so an unchanged file is not read again each turn.
const rolloutCache = new Map<string, { mtimeMs: number; found: CodexLimits | null }>()

/** Codex's limits from the newest rollouts under ~/.codex/sessions/<yyyy>/<mm>/<dd>/, looking back a week of folders. */
const readCodexLimits = async ($: EngineInterface): Promise<CodexLimits | null> => {
  const home = await homeDir($)
  if (home === null) return null
  const root = `${home}/.codex/sessions`
  const days: string[] = []
  for (const y of await listDesc($, root, 'dir')) {
    for (const m of await listDesc($, `${root}/${y.name}`, 'dir')) {
      for (const d of await listDesc($, `${root}/${y.name}/${m.name}`, 'dir')) {
        days.push(`${root}/${y.name}/${m.name}/${d.name}`)
        if (days.length >= 7) break
      }
      if (days.length >= 7) break
    }
    if (days.length >= 7) break
  }
  let reads = 0
  for (const day of days) {
    const files = (await listDesc($, day, 'file'))
      .filter(f => /^rollout-.*\.jsonl$/.test(f.name) && f.size <= MAX_READ)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const f of files) {
      if (reads++ >= 6) return null
      const path = `${day}/${f.name}`
      const cached = rolloutCache.get(path)
      if (cached?.mtimeMs === f.mtimeMs) {
        if (cached.found) return cached.found
        continue
      }
      try {
        const found = parseCodexLimits((await $.fs.read(path)) as string, f.mtimeMs)
        rolloutCache.set(path, { mtimeMs: f.mtimeMs, found })
        if (found) return found
      } catch {
        // unreadable: try the next one
      }
    }
  }
  return null
}

/** The one JSON line codex-limits.mjs prints, checked field by field; null for anything else. */
export const parseLiveLimits = (text: string): CodexLimits | null => {
  try {
    const x = JSON.parse(text.trim().split('\n').pop() ?? '') as Record<string, unknown>
    const win = (w: unknown): CodexWindow | null => {
      const v = w as { pct?: unknown; resetsAt?: unknown } | null
      return v && typeof v.pct === 'number' && typeof v.resetsAt === 'number' ? { pct: v.pct, resetsAt: v.resetsAt } : null
    }
    const limits = { fiveHour: win(x.fiveHour), weekly: win(x.weekly) }
    if (limits.fiveHour === null && limits.weekly === null) return null
    if (typeof x.seenAt !== 'number') return null
    return { ...limits, seenAt: x.seenAt, plan: typeof x.plan === 'string' ? x.plan : null }
  } catch {
    return null
  }
}

const LIVE_EVERY_MS = 60_000
let liveAskedAt = 0

/**
 * Codex's limits as Codex reports them now. Its session logs miss every `codex exec --ephemeral` run, so they
 * under-read. The helper ships next to routing.json; null when it is missing, Codex is down, or it is too soon.
 */
const liveCodexLimits = async ($: EngineInterface, force: boolean): Promise<CodexLimits | null> => {
  const now = await $.clock.now()
  if (!force && now - liveAskedAt < LIVE_EVERY_MS) return null
  liveAskedAt = now
  const home = await homeDir($)
  if (home === null) return null
  const helper = `${home}/.claude/delegation/codex-limits.mjs`
  if (!(await $.fs.exists(helper))) return null
  const ran = await $.process.run(['node', helper])
  return ran.exitCode === 0 ? parseLiveLimits(ran.stdout) : null
}

/** Live numbers first, then the newest session log that recorded any; a failed read keeps what was shown. */
const refreshCodexLimits = async ($: EngineInterface, force = false) => {
  const live = await liveCodexLimits($, force).catch(() => null)
  const found = live ?? (await readCodexLimits($))
  await update($, codexLimits, current => found ?? current)
}

/** Codex tokens delegated this session and today, from runs/ledger.jsonl (written by delegate.mjs). Null when nothing is readable. */
const refreshSavings = async ($: EngineInterface) => {
  const home = await homeDir($)
  let text = ''
  try {
    text = home === null ? '' : ((await $.fs.read(`${home}/.claude/delegation/runs/ledger.jsonl`)) as string)
  } catch {
    text = ''
  }
  const entries = parseLedger(text)
  const scope = (await read($, savingsScope)) ?? { id: null, since: 0 }
  const now = await $.clock.now()
  await update($, savings, () => (entries.length === 0 ? null : totalsFor(entries, now, scope)))
}

const readRoutingText = async ($: EngineInterface): Promise<string | undefined> => {
  const path = await routingPath($)
  if (path === null) return undefined
  try {
    return (await $.fs.read(path)) as string
  } catch {
    return undefined
  }
}

/** routing.json as the file holds it now (route.mjs may have changed it), mirrored into state. */
const refreshRouting = async ($: EngineInterface): Promise<Routing> => {
  const r = parseRouting(await readRoutingText($))
  await update($, route, () => r.preference)
  await update($, codexModel, () => r.codexModel)
  await update($, codexEffort, () => r.codexEffort)
  return r
}

/** Re-reads git, the turn count, the mode and the route: things that change between turns. */
const refreshBetweenTurns = async ($: EngineInterface) => {
  // file reads first: a failed host read below must not leave them stale
  await refreshRouting($).catch(() => undefined)
  await refreshCodexLimits($).catch(() => undefined)
  await refreshSavings($).catch(() => undefined)
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

/** Writes `patch` into routing.json, keeping its other keys, then mirrors the file into state. */
const setRouting = async ($: EngineInterface, patch: Partial<Routing>, what: string) => {
  const path = await routingPath($)
  if (path === null) {
    $.ui.toast(`${what} not saved: no home directory found.`)
    return
  }
  try {
    await $.fs.write(path, withRouting(await readRoutingText($), patch))
    await refreshRouting($)
  } catch (error) {
    $.ui.toast(`${what} not saved: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const setRoute = ($: EngineInterface, r: RouteName) => setRouting($, { preference: r }, 'Route')
const setCodexModel = ($: EngineInterface, id: string | null) => setRouting($, { codexModel: id }, 'Codex model')
const setCodexEffort = ($: EngineInterface, level: EffortName | null) =>
  setRouting($, { codexEffort: level }, 'Codex effort')

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

const USAGE = `Usage: /usage-hud [theme <${THEME_NAMES.join('|')}> | model <opus|sonnet|haiku|fable|auto> | effort <${EFFORTS.join('|')}|auto> | mode [name] | engine <claude|codex|status> | codex <model|effort|default> | auto [on|off|status|switch|downgrade|compact|fallback] [value]]`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-hud',
      description: 'Toggle the HUD; switch directly between Claude and Codex with shared context',
      argumentHint: '[engine|theme|model|effort|mode] [value]',
    })

    try {
      const { state } = await loadDirect($)
      await update($, directEngine, () => state.engine)
    } catch { /* no bound session yet */ }

    try {
      const [savedTheme, savedModel, savedEffort, savedHidden, savedAuto, savedSwitched] = await Promise.all([
        $.store.get('theme'),
        $.store.get('modelOverride'),
        $.store.get('effortOverride'),
        $.store.get('isHidden'),
        $.store.get('autoConfig'),
        $.store.get('autoSwitched'),
      ])
      if (savedSwitched === true) await update($, autoSwitched, () => true)
      if (typeof savedTheme === 'string' && isThemeName(savedTheme)) await update($, theme, () => savedTheme)
      if (typeof savedModel === 'string' && MODEL_IDS.includes(savedModel)) await update($, modelOverride, () => savedModel)
      if (typeof savedEffort === 'string' && isEffort(savedEffort)) await update($, effortOverride, () => savedEffort)
      if (typeof savedHidden === 'boolean') await update($, isHidden, () => savedHidden)
      if (savedAuto && typeof savedAuto === 'object') await update($, autoConfig, () => ({ ...DEFAULT_AUTO, ...(savedAuto as Partial<AutoConfig>) }))
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

    // The Saved line counts this session's ledger lines by Claude Code's session ID (same env var delegate.mjs reads).
    try {
      const raw = ((await $.env.get('CLAUDE_CODE_SESSION_ID')) ?? '').trim()
      const since = await $.clock.now()
      await update($, savingsScope, () => ({ id: raw === '' ? null : raw, since }))
    } catch {
      // without a scope the session total counts from the first render
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

    // ---- autopilot ----
    try {
      const cfg = await read($, autoConfig)
      const fivePct = five?.percentUsed ?? 0
      const ctxPct = e.context.percent ?? 0

      // Auto-switch engine to Codex when the 5h or 7 day limit is high, and back after the reset
      await autoEngine($, fiveHourPct(e.rateLimits, await $.clock.now()))

      // Auto-downgrade model at thresholds
      if (cfg.downgradeEnabled && !(await read($, autoDownDisabled))) {
        const override = await read($, modelOverride)
        const actual = (await read($, model))?.model ?? ''
        const origModel = await read($, autoOrigModel)

        if (fivePct >= 85 && actual !== 'claude-haiku-5-5' && override !== 'claude-haiku-5-5') {
          if (origModel === null) await update($, autoOrigModel, () => override ?? '__auto__')
          await setModel($, 'claude-haiku-5-5')
          $.ui.toast(`⚡ Auto-pilot: model → Haiku (5h at ${Math.round(fivePct)}%)`)
        } else if (fivePct >= 70 && fivePct < 85 && (actual === 'claude-opus-5-5' || override === 'claude-opus-5-5')) {
          if (origModel === null) await update($, autoOrigModel, () => override ?? '__auto__')
          await setModel($, 'claude-sonnet-5-5')
          $.ui.toast(`⚡ Auto-pilot: Opus → Sonnet (5h at ${Math.round(fivePct)}%)`)
        }

        // Restore original model when limit resets below 60%
        if (fivePct < 60 && origModel !== null) {
          const restoreTo = origModel === '__auto__' ? null : origModel
          await setModel($, restoreTo)
          await update($, autoOrigModel, () => null)
          $.ui.toast(`✅ Auto-pilot: model restored to ${modelButton(restoreTo)}`)
        }
      }
      // Re-enable auto-downgrade when limit drops below 60%
      if (fivePct < 60 && await read($, autoDownDisabled)) {
        await update($, autoDownDisabled, () => false)
      }

      // Auto-compact context
      // Every call re-reads the whole context, so a big window must not let it grow unchecked: also compact at an absolute size.
      const ctxTokens = (ctxPct / 100) * (e.context.window ?? 0)
      if (cfg.compactThreshold > 0 && (ctxPct >= cfg.compactThreshold || ctxTokens >= COMPACT_TOKENS) && !(await read($, autoCompacted))) {
        // The flag is set only once compaction ran, so a skip or failure retries on the next measurement.
        const result = await $.session.compact()
        if (result.skip !== undefined) {
          $.ui.toast(`Auto-compact skipped: ${result.skip}`)
        } else {
          await update($, autoCompacted, () => true)
          $.ui.toast(`⚡ Auto-pilot: compacted context (was ${Math.round(ctxPct)}% full)`)
        }
      }
      // Reset compact flag when context drops after compaction
      if (ctxPct < (cfg.compactThreshold > 0 ? cfg.compactThreshold - 10 : 70) && ctxTokens < COMPACT_TOKENS * 0.7) {
        await update($, autoCompacted, () => false)
      }
    } catch {
      // autopilot must never block a measurement
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastTurnAt = await $.clock.now()
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

  // The user's own prompts carry the routing preference, re-read so a change from route.mjs counts at once.
  on('prompt.submit', async ($, e, next) => {
    try {
      const kind = e.origin?.kind
      const isOwn = e.isMeta !== true && e.command === undefined && (kind === undefined || kind === 'composer' || kind === 'bridge' || kind === 'sdk')
      if (!isOwn || e.text.trimStart().startsWith('/')) return next(e)
      // A long idle gap expires the prompt cache: this prompt would re-write the whole context at the dearer write price.
      try {
        const [pct, win, now] = await Promise.all([read($, context), read($, contextWindow), $.clock.now()])
        if (lastTurnAt > 0 && now - lastTurnAt > IDLE_CACHE_MS && ((pct ?? 0) / 100) * (win ?? 0) > IDLE_WARN_TOKENS) {
          $.ui.toast(`Idle ${shortSpan(now - lastTurnAt)}: the cache expired, so this prompt re-writes ~${tokensLabel(((pct ?? 0) / 100) * (win ?? 0))} of context. /compact or /clear first is cheaper.`)
        }
      } catch { /* a warning must never block a prompt */ }
      // In Codex mode Claude makes no calls, so its limits go stale: re-read them so the way back to Claude opens at the reset.
      if (await read($, directEngine) === 'codex' && await read($, autoSwitched)) {
        try {
          const usage = await $.session.usage()
          await update($, limits, () => usage.rateLimits)
        } catch { /* a stale reading still ends at the reset time */ }
        await autoEngine($, fiveHourPct(await read($, limits), await $.clock.now())).catch(() => undefined)
      }
      // Prompts always go to Claude: no automatic or intercepted Codex routing here (Codex runs only via /codex:* or delegate.mjs).
      const r = await refreshRouting($)
      return next({ ...e, context: [...(e.context ?? []), routeContext(r, await readUsage($))] })
    } catch (error) {
      // A prompt is never dropped: log the failure and let the prompt reach Claude unchanged.
      console.error('usage-hud: prompt routing failed, sending the prompt unchanged', error)
      return next(e)
    }
  })

  // Worker activity, only where it is observable: a foreground Bash call that starts with codex exec.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const name = workerOf(e.command)
    if (name === null || e.run_in_background === true) return next(e)

    const startedAt = await $.clock.now()
    await update($, worker, () => ({ name, startedAt }))
    try {
      const ran = await next(e)
      const outcome = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'failed' : 'ok'
      const ms = (await $.clock.now()) - startedAt
      await update($, lastWorker, () => ({ name, ms, outcome }))
      return ran
    } finally {
      await update($, worker, () => null)
      await refreshCodexLimits($, true).catch(() => undefined) // the run just spent some: ask Codex now
    }
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
    if (sub === 'engine') {
      if (arg === 'claude' || arg === 'codex') return { text: await switchEngine($, arg, true) }
      const { state } = await loadDirect($)
      return { text: 'Engine: ' + state.engine + '. Codex thread: ' + (state.threadId ?? 'not started') +
        (state.pending ? '. Last request is pending or interrupted; inspect changes before continuing.' : '') +
        '. Use /usage-hud engine claude or /usage-hud engine codex.' }
    }
    if (sub === 'theme' && isThemeName(arg)) {
      await setTheme($, arg)
      return { text: `Usage HUD theme: ${arg}.` }
    }
    // With Codex as the engine, model and effort mean Codex's; the same thread is resumed with the new values.
    if (sub === 'codex' || ((sub === 'model' || sub === 'effort') && (await read($, directEngine)) === 'codex')) {
      const isEffortCmd = sub === 'effort' || (sub === 'codex' && isEffort(rest[0] ?? '') && rest[0] !== undefined)
      if (isEffortCmd) {
        const v = sub === 'codex' ? rest[0] : arg
        if (v !== undefined && (v === 'auto' || v === 'default' || isEffort(v))) {
          const level = isEffort(v) ? v : null
          await setCodexEffort($, level)
          return { text: `Codex effort: ${level ?? 'default'} (from the next request, same Codex thread).` }
        }
      } else {
        const m = sub === 'codex' ? rest.join(' ') : arg
        const isDefault = m === 'auto' || m === 'default'
        const id = isDefault ? null : findCodexModel(m)
        if (isDefault || id !== undefined) {
          await setCodexModel($, id ?? null)
          return { text: `Codex model: ${id ?? 'account default'} (from the next request, same Codex thread).` }
        }
      }
      return { text: `Codex models: ${CODEX_MODELS.join(', ')}, default. Efforts: ${EFFORTS.join(', ')}. Use /usage-hud codex <model|effort>.` }
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
    if (sub === 'auto') {
      const cfg = await read($, autoConfig)
      if (arg === '' || arg === 'status') {
        const sw = cfg.switchThreshold > 0 ? `${cfg.switchThreshold}%` : 'off'
        const dg = cfg.downgradeEnabled ? 'on (opus→sonnet@70%, →haiku@85%)' : 'off'
        const cp = cfg.compactThreshold > 0 ? `${cfg.compactThreshold}%` : 'off'
        const fb = cfg.fallbackEnabled ? 'on' : 'off'
        return { text: `Auto-pilot: switch engine at ${sw}, downgrade model ${dg}, compact at ${cp}, fallback ${fb}.` }
      }
      const parts = arg.split(/\s+/)
      const feature = parts[0]
      const val = parts[1] ?? ''
      const nextCfg: Partial<AutoConfig> = {}
      if (feature === 'switch') {
        if (val === 'off') nextCfg.switchThreshold = 0
        else { const n = parseInt(val); if (n >= 50 && n <= 99) nextCfg.switchThreshold = n; else return { text: 'auto switch <50-99|off>' } }
      } else if (feature === 'downgrade') {
        if (val === 'on') nextCfg.downgradeEnabled = true
        else if (val === 'off') nextCfg.downgradeEnabled = false
        else return { text: 'auto downgrade <on|off>' }
      } else if (feature === 'compact') {
        if (val === 'off') nextCfg.compactThreshold = 0
        else { const n = parseInt(val); if (n >= 50 && n <= 99) nextCfg.compactThreshold = n; else return { text: 'auto compact <50-99|off>' } }
      } else if (feature === 'fallback') {
        if (val === 'on') nextCfg.fallbackEnabled = true
        else if (val === 'off') nextCfg.fallbackEnabled = false
        else return { text: 'auto fallback <on|off>' }
      } else if (feature === 'on') {
        Object.assign(nextCfg, DEFAULT_AUTO)
      } else if (feature === 'off') {
        nextCfg.switchThreshold = 0; nextCfg.downgradeEnabled = false; nextCfg.compactThreshold = 0; nextCfg.fallbackEnabled = false
      } else {
        return { text: 'auto [on|off|switch <50-99|off>|downgrade <on|off>|compact <50-99|off>|fallback <on|off>]' }
      }
      const updated = { ...cfg, ...nextCfg }
      await update($, autoConfig, () => updated)
      await $.store.set('autoConfig', updated)
      return { text: `Auto-pilot updated. ${feature}: ${val || (feature === 'on' ? 'all enabled' : 'all disabled')}.` }
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
    const [pickedModel, pickedEffort, mode, turnCount, toolCount, day, routeName, running, finished] = await Promise.all([
      read($, modelOverride),
      read($, effortOverride),
      read($, modeLabel),
      read($, turns),
      read($, toolCalls),
      read($, today),
      read($, route),
      read($, worker),
      read($, lastWorker),
    ])
    const [cxModel, cxEffort, cxLimits, autoCfg] = await Promise.all([read($, codexModel), read($, codexEffort), read($, codexLimits), read($, autoConfig)])
    const savedTotals = await read($, savings)
    const savedCodex5h = windowPct(cxLimits?.fiveHour ?? null, now)
    const saved = savedParts(savedTotals, savedCodex5h)
    const savedTone = codexTone(savedCodex5h)
    const activeEngine = await read($, directEngine)
    const activeStatus = await read($, directStatus)
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
    // Codex's own limits get rings too where there is room beside the three Claude ones.
    const codexRing = (label: string, kind: string, w: CodexWindow | null) => ({
      label,
      kind,
      pct: windowPct(w, now),
      note: w === null ? 'no data' : resetsIn(new Date(w.resetsAt).toISOString(), now),
      resetsAt: undefined,
    })
    if (e.props.bodyColumns >= 175 && cxLimits !== null) {
      rings.push(codexRing('codex 5h', 'codex_5h', cxLimits.fiveHour), codexRing('codex wk', 'codex_wk', cxLimits.weekly))
    }
    const maxPct = Math.max(0, ...all.map(l => l.percentUsed))
    // the fuller Codex window colours its row
    const cxPcts = cxLimits === null ? [] : [windowPct(cxLimits.fiveHour, now), windowPct(cxLimits.weekly, now)]
    const cxKnown = cxPcts.filter((p): p is number => p !== null)
    const cxPeak = cxKnown.length === 0 ? null : Math.max(...cxKnown)
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
      { key: 'engine', name: 'Engine', value: activeEngine, onPress: async () => {
        $.ui.toast(await switchEngine($, activeEngine === 'claude' ? 'codex' : 'claude', true))
      } },
      { key: 'theme', name: 'Theme', value: themeName, onPress: () => setTheme($, nextTheme(themeName)) },
      {
        key: 'model',
        name: activeEngine === 'codex' ? 'Model·Cx' : 'Model',
        // one Model button: it drives whichever engine is active
        value: activeEngine === 'codex' ? codexModelButton(cxModel) : modelButton(pickedModel),
        onPress: activeEngine === 'codex'
          ? () => setCodexModel($, cycle(CODEX_MODEL_IDS, cxModel))
          : async () => { await setModel($, cycle(MODEL_IDS, pickedModel)); await update($, autoDownDisabled, () => true); await update($, autoOrigModel, () => null) },
      },
      {
        key: 'effort',
        name: activeEngine === 'codex' ? 'Effort·Cx' : 'Effort',
        value: activeEngine === 'codex' ? (cxEffort ?? 'default') : (pickedEffort ?? 'auto'),
        onPress: activeEngine === 'codex'
          ? () => setCodexEffort($, cycle(EFFORTS, cxEffort))
          : () => setEffort($, cycle(EFFORTS, pickedEffort)),
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
      // Delegation to the Codex worker CLI; Claude's own model stays the Model control's.
      { key: 'route', name: 'Route', value: routeName, onPress: () => setRoute($, nextRoute(routeName)) },
      // These set the model Claude delegates to; with Codex as the engine, Model and Effort above already do that.
      ...(activeEngine === 'codex' ? [] : [
        {
          key: 'codexModel',
          name: 'Codex',
          value: codexModelButton(cxModel),
          // a hand-set model outside the list goes back to the default
          onPress: () => setCodexModel($, cycle(CODEX_MODEL_IDS, cxModel)),
        },
        { key: 'codexEffort', name: 'Cx eff', value: cxEffort ?? 'default', onPress: () => setCodexEffort($, cycle(EFFORTS, cxEffort)) },
      ]),
      { key: 'autopilot', name: 'Auto', value: isAutoOn(autoCfg) ? '✦ on' : 'off',
        onPress: async () => {
          const isOn = isAutoOn(autoCfg)
          const toggledCfg = isOn ? { switchThreshold: 0, downgradeEnabled: false, compactThreshold: 0, fallbackEnabled: false } : { ...DEFAULT_AUTO }
          await update($, autoConfig, () => toggledCfg)
          await $.store.set('autoConfig', toggledCfg)
          $.ui.toast(isOn ? 'Auto-pilot off' : '⚡ Auto-pilot on (switch@85%, downgrade, compact@85%, fallback)')
        } },
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
          <Text wrap="truncate-end">{name('engine', 8)}{value(activeEngine)}{activeStatus ? ' · ' + activeStatus : ''}</Text>
          <Text>
            {name('model', 8)}
            {value(modelLine)}
          </Text>
          <Text wrap="truncate-end">
            {name('tasks', 8)}
            {taskLine}
          </Text>
          <Text wrap="truncate-end">
            {name('worker', 8)}
            <Text
              color={running ? hex(th.warn) : finished && finished.outcome !== 'ok' ? hex(th.bad) : undefined}
              dimColor={!running && !finished}
            >
              {workerLine(running, finished)}
            </Text>
          </Text>
          <Text wrap="truncate-end">
            {name('codex', 8)}
            <Text
              color={cxPeak === null ? undefined : hex(fillColor(cxPeak, th))}
              dimColor={cxLimits === null}
            >
              {codexLine(cxLimits, now)}
            </Text>
            <Text>{` · ${saved.saved} · `}</Text>
            <Text color={savedTone === 'bad' ? hex(th.bad) : savedTone === 'warn' ? hex(th.warn) : undefined}>{saved.codex}</Text>
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
