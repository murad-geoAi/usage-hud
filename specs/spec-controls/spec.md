# Spec: spec-controls

## Goal
- Drive the spec workflow (/spec, /build, /check, /resume) from the existing usage-hud panel, and see feature progress without opening tasks.md.

## Requirements
- R1: Keep the current layout (rings | NOW | CONTROLS | footer). No new panel.
- R2: NOW column gets one "Spec" line for the selected feature: name, done/total bar, blocked count, next task = first unticked non-blocked task (truncated); `all done` when none.
- R3: Features = every `specs/*/tasks.md` in the session cwd, except `_template`. Task line = a checkbox line `- [ ]`/`- [x]`/`- [X]` (any indent). Done = ticked, total = all task lines, blocked = unticked task lines containing `BLOCKED`. Empty/no task lines → 0/0.
- R4: Selection on each refresh: keep the current selection if it still exists; else the feature matching git branch `feature/<name>`; else the first unfinished (by name); else the first; else none. A "Feat" control cycles through all. Branch is read in the same refresh, before selection.
- R5: CONTROLS gets "Build" mode (cycles split → claude → codex). Stored in `$.state` key `specMode`, initial `split`, unknown values read as `split`. The flag goes into /build and /resume (`split` = no flag).
- R6: Mode hint (warn color, only when it differs from the chosen mode), each known window judged alone, unknown windows ignored: `claude` if any known Codex window >= 85% or the Codex plugin is confirmed absent (this wins when both sides are high); else `codex` if Claude 5h >= 85%; else none.
- R7: Action buttons Spec / Build / Check / Resume put the command in the prompt box with `$.prompt.fill` (mode replace). They never submit. Spec fills `/spec `. The others need a selected feature; without one they toast "No feature in specs/". If fill returns `isFilled: false`, toast "Could not fill the prompt (dialog open?)".
- R8: Warning in NOW only when the Codex plugin is confirmed absent: `~/.claude/plugins/installed_plugins.json` parses and no key under `plugins` starts with `codex@`. Missing/unreadable/malformed file = unknown = no warning. Home dir from the existing helper in register.tsx.
- R9: Refresh the feature list at session start and after each turn (with the existing git refresh). No timers, no file watchers.

## Out of scope
- Editing tasks.md from the HUD, submitting commands automatically, PR links, a separate pane, changes to the slash command files.
- The 3 security findings (separate feature).

## Acceptance criteria
- [ ] AC1: With `specs/a/tasks.md` (2 of 5 ticked, 1 BLOCKED), NOW shows `a 2/5 · 1 blocked · next: <T3 text>`.
- [ ] AC2: `_template` never appears; no `specs/` folder → no Spec line, no error.
- [ ] AC3: On branch `feature/b`, feature `b` is selected by default.
- [ ] AC4: Clicking Build with mode `claude` fills `/build <feature> --claude`; with `split` fills `/build <feature>`. Resume likewise. Check fills `/check <feature>`. Spec fills `/spec `.
- [ ] AC5: Mode hint appears per R6 and disappears when it matches the chosen mode.
- [ ] AC6: Missing Codex plugin → warning line in NOW.
- [ ] AC7: `claude plugin test .` and `claude plugin validate .` pass; existing 39 tests still pass.

## Open questions
- None blocking. (Assumed answers: fill-not-submit, all features listed, mode hint on, next task + Codex warning as extras.)
