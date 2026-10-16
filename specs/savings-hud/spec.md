# Spec: savings-hud

## Goal
- Show how many Codex tokens were delegated instead of run through Claude, per session and per day, in the HUD.
- Show Codex 5h usage next to it as a warning, so the user sees when Codex is near its limit.

## Requirements
- R1: Each Codex call from `delegate.mjs` appends one line to `~/.claude/delegation/runs/ledger.jsonl` with: timestamp (`at`), task name (`task`), Claude Code session ID (`session`), input tokens, output tokens.
- R2: Ledger lines older than 30 days are deleted when a new line is appended.
- R3: Saved value = Codex input tokens + output tokens. No percentage of the Claude limit is shown.
- R4: HUD line format: `Saved: 12k session · 84k today · Codex 5h: 40%`. Token counts use `k` below 1,000,000 and `M` above.
- R5: "Today" = local midnight to now on this machine (America/Chicago for this user).
- R6: "Session" = entries whose `session` equals the current Claude Code session ID. Not the HUD's first render time.
- R6a: If the session ID is not available to `delegate.mjs`, write no `session` field; the Session total then falls back to the current behavior (HUD first render time) and this is noted in plan.md.
- R7: Codex 5h value is yellow above 70% and red above 90%. Exactly 70 and 90 are not colored. Warning only.
- R8: If the ledger is missing or a line is broken, skip that line. If nothing readable is left, show `Saved: --`. Never crash the HUD.
- R9: Display only. The HUD never changes settings, picks models, routes work, or calls Claude/Codex.
- R10: Legacy lines (no `task` field) count toward totals and show task as `unknown`.

## Out of scope
- Any % of the Claude limit.
- A separate pane or new HUD row (one line only).
- Changing routing or the Codex helper's model/effort choices.
- Migrating or deleting the ledger beyond the 30-day prune.

## Acceptance criteria
- [ ] AC1: After a Codex call via `delegate.mjs`, the ledger's last line has `at`, `task`, `codexTokens.input`, `codexTokens.output`.
- [ ] AC2: Appending a line removes ledger lines older than 30 days; newer lines stay in order.
- [ ] AC3: Totals: session and today match the sum of qualifying lines in a fixture; session counts only lines whose `session` matches the current ID; a line at 23:59:59 yesterday is not in today; 00:00:00 today is.
- [ ] AC4: Missing ledger file → `Saved: --`; a broken line is skipped, other lines still count.
- [ ] AC5: Codex 5h at 70 → no color, 71 → yellow, 90 → yellow, 91 → red; unknown Codex limit → `Codex 5h: --`.
- [ ] AC6: `claude plugin test .` passes; `claude plugin validate .` passes.

## Open questions
- Session ID source: confirm how `delegate.mjs` (run via Bash) gets the current Claude Code session ID. Not found in the repo or in `delegate.mjs` as of this spec. Fallback is R6a.
- Approved by user with the session-ID change. Codex critique skipped for this spec by user request.
