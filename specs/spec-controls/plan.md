# Plan: spec-controls

## Approach
- New pure module `hooks/spec.ts` (no `$` except one reader): `parseTasks(text)`, `pickFeature(features, branch)`, `buildCommand(kind, feature, mode)`, `suggestMode(claude5h, codexLimits, codexInstalled)`, `specLine(feature)`; `readFeatures($, cwd)` lists `specs/` via `$.fs.list` + `$.fs.read`; `codexInstalled($, home)` reads `installed_plugins.json`.
- `register.tsx`: new atoms `specFeatures`, `specSelected`, `specMode`, `codexPluginInstalled`; refresh them where `readGit` runs (~L659) and in `session.start`.
- UI: add the Spec line + warning to the NOW rows; add `Feature` and `Build` entries to the controls array (~L1222–1272) and one row of 4 action Buttons calling `$.prompt.fill({ text, mode: 'replace' })`.
- Contract: add the 4 values to `types/index.d.ts` (`SpecFeature`, `BuildMode` types).

## Files to change
- `hooks/spec.ts` (new) — parsing, selection, command strings, mode hint, fs readers
- `hooks/spec.test.ts` (new) — unit tests for spec.ts
- `hooks/register.tsx` — atoms, refresh, NOW line, controls, action buttons
- `hooks/register.test.ts` — render/click tests (fill called with the right text)
- `types/index.d.ts` — state contract
- `README.md` — short "Spec workflow controls" section
- Read-only reference: `CLAUDE.md`, `.claude/commands/*.md` (flag names)

## Risks
- `register.tsx` is 1367 lines; edits must stay local to refresh, NOW rows and the controls array.
- Panel width: more controls may wrap at narrow terminals → keep labels short (`Feat`, `Build`), truncate next-task text.
- `$.prompt.fill` returns `isFilled: false` under a dialog/headless → toast the command instead.
- `installed_plugins.json` format is the host's, may change → missing/unparseable = "unknown", no warning (fail quiet, not loud).
- Windows paths: join with `/`, `$.fs` accepts forward slashes (existing code does this).

## Test strategy
- Command: `claude plugin test .` then `claude plugin validate .`
- spec.test.ts: parseTasks counts/next/blocked, `_template` skipped, no specs dir, pickFeature by branch and fallback, buildCommand for all modes/kinds, suggestMode thresholds.
- register.test.ts: Spec line rendered from a fixture fs; Build button fills expected text; Feature control cycles; warning shown when plugin missing.

## Codex critique (applied)
- Keep selection across refresh; defined fallback order (R4).
- `specMode` key, default and validation defined (R5).
- Home dir: reuse register.tsx's existing home helper; plugin absent vs unknown separated (R8).
- Blocked/next rules reconciled (R2, R3); per-window unknown handling + precedence (R6).
- `isFilled: false` → explicit warning toast, tested (R7).
- Git branch read before feature selection in the same refresh.
- T4 split into T4 [M] (NOW) and T4b [L] (controls + fill).
- More tests: selection kept/removed, empty file, `[X]`/indent, partial unknown limits, malformed JSON, fill failure.
- Skipped: narrow-layout render test (no width harness; truncation tested in unit tests).
