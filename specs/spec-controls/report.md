# Report: spec-controls

## Built
- `hooks/spec.ts`: parse tasks.md, pick feature, build commands, mode hint, read specs/ and installed_plugins.json.
- NOW column: Spec line (bar, done/total, blocked, next task) + Codex-plugin-missing warning.
- CONTROLS: `Feat` cycle, `Build` mode cycle with `(try …)` hint, `/spec /build /check /resume` fill buttons.
- README section.

## Acceptance criteria
- AC1 pass — spec row test (`a ▰▰▰▱▱▱▱▱ 2/5 · 1 blocked · next: T4 four`).
- AC2 pass — `_template` skipped; no specs/ → no row, no error.
- AC3 pass — `feature/b` selects `b`.
- AC4 pass — fill texts tested for all actions and modes.
- AC5 pass — hint shown when Codex plugin missing, gone once mode matches; thresholds unit-tested.
- AC6 pass — warning only when plugin confirmed absent.
- AC7 pass — 57 tests pass, validate passes (warnings only).

## Decisions
- Built in `--claude` mode (Codex plugin not installed); Codex reviews via `delegate.mjs` with inline text.
- Feature names limited to `[\w.-]+`, control chars stripped (security review). Review point "R3 says every folder" kept as is.
- Accepts `*` bullets too (superset of R3), bare `- [ ]` ignored.
- Review fixes: stored Build mode normalized via `asBuildMode`; empty tasks.md shows `0/0 · no tasks`.
- Not verified live in a terminal session; run `/reload-plugins` and look.

## Blocked
- None.

## Test result
- `claude plugin test .`: 57 pass, 0 fail. `claude plugin validate .`: passed with warnings.
