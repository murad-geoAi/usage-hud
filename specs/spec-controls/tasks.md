# Tasks: spec-controls

Mode: claude
Size: [S] one file, clear change, < ~50 lines · [M] a few files · [L] design decisions or tricky logic

- [x] T1 [S] `hooks/spec.ts`: `parseTasks(text)` → `{ done, total, blocked, next }` (+ cases in `hooks/spec.test.ts`)
  - Done when: per R3/R2 (any indent, `[X]` too, empty file 0/0, all done → next null); next text has checkbox and size tag stripped
  - Test: `claude plugin test .`
- [x] T2 [S] `hooks/spec.ts`: `buildCommand(kind, feature, mode)` and `suggestMode(claude5h, codexLimits, codexInstalled)` (+ tests)
  - Done when: AC4 strings exact; R6 rules incl. partial unknown windows, both-high precedence, plugin unknown vs absent
  - Test: `claude plugin test .`
- [x] T3 [M] `hooks/spec.ts` readers + `pickFeature`; `types/index.d.ts` contract; atoms + refresh in `register.tsx`
  - Done when: refresh at session start and after each turn, git branch read first; selection kept across refresh (R4 order); selected feature removed → falls back; `_template` skipped; missing `specs/` → `[]`; plugin flag `true|false|null` (malformed → null); `specMode` validated
  - Test: `claude plugin test .` + `claude plugin validate .`
- [x] T4 [M] `register.tsx` NOW column: Spec line (truncated next task, `all done`) + Codex warning; tests in `register.test.ts`
  - Done when: AC1, AC2, AC6 covered by tests
  - Test: `claude plugin test .` + `claude plugin validate .`
- [x] T4b [L] `register.tsx` CONTROLS: `Feat` cycle, `Build` mode cycle with hint, Spec/Build/Check/Resume buttons via `$.prompt.fill`; `isFilled: false` → warning toast; tests in `register.test.ts`
  - Done when: AC4, AC5 covered; fill-failure path tested; mode persists across re-render
  - Test: `claude plugin test .` + `claude plugin validate .`
- [ ] T5 [S] `README.md`: "Spec workflow controls" section (≤ 10 lines)
  - Done when: lists controls and what each button fills
  - Test: `claude plugin validate .`

## Decisions
-

## Blocked
-
