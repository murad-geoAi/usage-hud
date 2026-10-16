// Codex tokens delegated instead of run through Claude, read from runs/ledger.jsonl. Pure: no I/O.

export type LedgerEntry = { at: number; task: string; session: string | null; tokens: number }

export type SavingsTotals = { session: number; today: number }

/** The session the totals are for: its Claude Code ID, or null to count from when the HUD first rendered. */
export type SessionScope = { id: string | null; since: number }

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/** One entry per readable line. Broken lines and lines without a timestamp are skipped; legacy lines get task "unknown". */
export const parseLedger = (text: string): LedgerEntry[] =>
  text.split('\n').flatMap(line => {
    try {
      const e = JSON.parse(line)
      if (!e || typeof e !== 'object' || typeof e.at !== 'number' || !Number.isFinite(e.at)) return []
      const tokens = num(e.codexTokens?.input) + num(e.codexTokens?.output)
      return [{
        at: e.at,
        task: typeof e.task === 'string' && e.task !== '' ? e.task : 'unknown',
        session: typeof e.session === 'string' && e.session !== '' ? e.session : null,
        tokens,
      }]
    } catch {
      return []
    }
  })

/** Local midnight of the day containing `now`. */
export const dayStart = (now: number): number => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Session = entries of the current session ID; without an ID, entries since the HUD first rendered. Today = local midnight to now. */
export const totalsFor = (entries: LedgerEntry[], now: number, scope: SessionScope): SavingsTotals => {
  const midnight = dayStart(now)
  let session = 0
  let today = 0
  for (const e of entries) {
    if (e.at > now) continue
    if (e.at >= midnight) today += e.tokens
    const inSession = scope.id !== null ? e.session === scope.id : e.at >= scope.since
    if (inSession) session += e.tokens
  }
  return { session, today }
}

/** k below 1,000,000, M above: 12k, 84k, 1.2M. */
export const formatTokens = (n: number): string => {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** Codex 5h colour: yellow above 70, red above 90. Exactly 70 and 90 stay uncoloured. Unknown stays uncoloured. */
export const codexTone = (pct: number | null): 'none' | 'warn' | 'bad' =>
  pct === null ? 'none' : pct > 90 ? 'bad' : pct > 70 ? 'warn' : 'none'

/** The two parts of the line, so the Codex part can be coloured. Null totals (no readable ledger) show `--`. */
export const savedParts = (totals: SavingsTotals | null, codex5h: number | null): { saved: string; codex: string } => ({
  saved: totals === null ? 'Saved: --' : `Saved: ${formatTokens(totals.session)} session · ${formatTokens(totals.today)} today`,
  codex: `Codex 5h: ${codex5h === null ? '--' : `${Math.round(codex5h)}%`}`,
})

export const savedLine = (totals: SavingsTotals | null, codex5h: number | null): string => {
  const { saved, codex } = savedParts(totals, codex5h)
  return `${saved} · ${codex}`
}
