# Plan: savings-hud

## Approach
- `delegate.mjs` already appends to `runs/ledger.jsonl` (L146) with `codexTokens: {input, cached, output}`. Add `task` (first 80 chars of the `[TASK]` line), `session` (Claude Code session ID) and prune lines older than 30 days when appending.
- Session ID: user decision (approved change). Session totals filter on `session === currentSessionId`. Source order, decided by the user:
  1. Env var, if `delegate.mjs` can read the session ID from one (check during build).
  2. Else a `SessionStart` hook (task T0) reads `session_id` from its JSON input and writes `~/.claude/delegation/current-session-<project-folder-name>.txt`. `delegate.mjs` reads that file. The HUD uses `session_id` from its own input.
  3. Else the first-render fallback (R6a), noted in the build report.
  - Not tested now. Check during the build with one real call. The HUD side is also unverified: `register.tsx` has no `session_id` today (`session.start` gives `usage.startedAt` only), so confirm the HUD API exposes it before relying on step 2 for the HUD.
- New pure module `hooks/savings.ts`: parse ledger text, sum session and today, format tokens. No I/O, so it is unit-tested.
- `hooks/register.tsx`: read the ledger file on the same refresh as `codexLimits` (atom at L138), compute totals, add one text segment to the usage row (`usageLine` L292 area, `codexLine` L353 for the Codex 5h value).
- Day boundary reuses `dayKey` (L433, local calendar day). Existing `addToday` (L686) totals are in-memory only and stay unchanged.

## Files to change
- `delegate.mjs` — add `task` field to the ledger line (L146); prune lines > 30 days before append
- `hooks/savings.ts` — new: `parseLedger(text)`, `totalsFor(entries, now, sessionStart)`, `formatTokens(n)`, `savedLine(totals, codex5h)`
- `hooks/savings.test.ts` — new: AC2–AC5 fixtures
- `hooks/register.tsx` — new atom for savings totals; read file; render segment; yellow/red color for Codex 5h (L353 area, L1389-1394 text row); session start atom
- `hooks/register.test.ts` — assert rendered segment string and color thresholds
- `types/index.d.ts` — `SavingsTotals` type if the atom crosses module boundaries
- `README.md` — short "Savings line" section (≤ 10 lines)
- `install-local.mjs` — only if it lists hook files explicitly (check; add `savings.ts` if so)

## Risks
- Ledger grows: 30-day prune on every append keeps it small; a broken line must not block the rest.
- Session ID not available: fallback to first-render time (R6a). A HUD reload mid-session then resets "session" to the reload time. This fallback must be noted in the build report if used.
- Session ID source unknown: the HUD and `delegate.mjs` must agree on the ID. A mismatch shows 0 for session. Verify with one real call before ticking T3.
- Pressure high (claude5h 92% at planning time): build in small steps; no Codex calls for this planning work.
- Codex 5h unknown (`null`) → show `--`, never 0%.
- Reading the file on every refresh: keep it cheap (one read, capped at last 30 days of lines).
- No Claude/Codex calls: check that the new code path never invokes the Codex helper.

## Test strategy
- Command: `claude plugin test .` and `claude plugin validate .` (from CLAUDE.md "Project facts")
- New/changed tests: `hooks/savings.test.ts` (totals, midnight, broken line, prune cutoff, token format); `hooks/register.test.ts` (segment string, `Saved: --`, Codex color thresholds)
- Manual: run one Codex call through `delegate.mjs`, then `/reload-plugins`, check the line.

## Codex critique
- Skipped for this spec by user request (session-ID change approved without critique).
- Claude self-review (no Codex): prune must run on the same append (R2), so an unwritable ledger cannot grow; the codexLimits read stays on the existing refresh path, so no new process is spawned.
