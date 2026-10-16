# Tasks: savings-hud

Mode: claude
Size: [S] one file, clear change, < ~50 lines · [M] a few files · [L] design decisions or tricky logic

- [x] T0 [S] (not needed, see Decisions) Session ID bridge. Only if the env-var check fails: add a `SessionStart` hook that reads `session_id` from its JSON input and writes `~/.claude/delegation/current-session-<project-folder-name>.txt`
  - Step 1 (during build, not now): check whether `delegate.mjs` can read the session ID from an env var. If yes, skip this task and mark it "not needed" in Decisions.
  - Done when: the file is written on session start; `delegate.mjs` reads it (same project folder name); the HUD uses `session_id` from its own input
  - Test: one real Codex call during the build; the ledger line's `session` matches the current session ID
- [x] T1 [S] `delegate.mjs`: add `task` and `session` to the ledger line; prune ledger lines older than 30 days on append (L146)
  - Done when: AC1 and AC2 hold; a line without a `[TASK]` gets `task: "unknown"`; `session` is the current session ID (omitted when unavailable, per R6a); prune keeps malformed lines out of the output only if they are unreadable
  - Test: `node --check delegate.mjs`; manual: one Codex call, inspect last line of `runs/ledger.jsonl`
- [x] T2 [M] `hooks/savings.ts` (new) + `hooks/savings.test.ts`: `parseLedger`, `totalsFor`, `formatTokens`, `savedLine`
  - Done when: AC3, AC4, AC5 (Codex color part as a pure function); R8 `Saved: --` fallback; R10 legacy lines
  - Test: `claude plugin test .`
- [x] T3 [M] `hooks/register.tsx`: atom + file read on refresh (near L138 and L621-640 pattern); render segment in usage row; color Codex 5h (L353 `codexLine`, L1389-1394 row); session atom uses the HUD's own `session_id` input (fallback R6a if unavailable)
  - Done when: AC4/AC5 visible in the HUD; no new Claude/Codex call (R9); `register.test.ts` covers the segment
  - Test: `claude plugin test .`
- [ ] T4 [S] `README.md`: "Savings line" section (≤ 10 lines); `install-local.mjs` only if it lists hook files
  - Done when: AC6 passes; README describes the line and the 30-day retention
  - Test: `claude plugin validate .`

## Decisions
- T0 not needed: `CLAUDE_CODE_SESSION_ID` is set in the Claude Code environment, so `delegate.mjs` reads the session ID from it. No hook, no file.
- T3 session source: the HUD reads the same `CLAUDE_CODE_SESSION_ID` via `$.env.get`, after checking the HUD API's session fields. No `current-session-*.txt` file exists, so the user's file step is skipped; the env var is the same source T0 would have written. First-render fallback (R6a) only when the env var is missing.
- T1 ledger test: run with a fixture home, `PATH` empty and `APPDATA` redirected, so no Codex call was made. Verified prune (31-day line removed), broken line skipped, `task` capped at 80 chars, `session` written.
- Codex was not used for this build (`--claude`).

## Blocked
- (task id — error — what was tried)
