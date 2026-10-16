---
description: Build an approved feature task by task on feature/<name>; Opus orchestrates, Codex implements [S] and [M] tasks
argument-hint: <feature-name> [--claude | --codex]
model: opus
---

Arguments: $ARGUMENTS

Setup
- Read CLAUDE.md "Project facts", then `specs/<feature>/spec.md`, `plan.md`, `tasks.md` once. Read only files listed in plan.md unless you must explore (Haiku Explore subagent, paths + lines only). Do not re-read files.
- `git switch feature/<feature>` if it exists, else `git switch -c feature/<feature>` from `main`. Working tree must be clean; if not, commit WIP first.
- Write the mode at the top of tasks.md (`Mode: split|claude|codex`).

Mode
- Default (split): [S] and [M] -> Codex; [L] (design decisions, tricky logic) -> you.
- `--claude`: you write every task.
- `--codex`: Codex writes every task; you only review the diff, run tests, tick and commit.

Sending a task to Codex
- ONE Bash call from the project root, `timeout: 600000`, foreground, one task at a time. Do not edit files while it runs (its diff is a before/after snapshot):
  ```
  node ~/.claude/delegation/delegate.mjs --mode implement <<'EOF'
  [TASK] <task line from tasks.md>
  [CONTEXT] Spec: specs/<feature>/spec.md. Files: <paths from plan.md>. <the relevant plan details and excerpts>. Test: <command>.
  [GOAL] Done when: <...>. Change those files only. Do not commit.
  EOF
  ```
- You get Codex's SUMMARY / CHECKS / OPEN and the diff. Review the diff against the task before anything else.
- Exit 3 (Codex near its limit) or a usage-limit error: do not retry. Switch the remaining build to `--claude` and tell me in one line.

For every task
1. Implement, or send it to Codex and review the diff it returns (right files, nothing unrelated, no deleted tests).
2. Run the test and lint commands from Project facts. Never tick a task with a failing test.
3. Tick it in tasks.md, then `git add` the task's files + tasks.md and commit `feat(<feature>): <task>`.

Failures
- A task fails twice -> hand it to the other model (Claude -> Codex; Codex -> you).
- Fails again -> mark `BLOCKED: <error, one line>` in tasks.md (and under "Blocked"), commit, move on.

Rules
- Do not ask me questions. Pick the option closest to the spec and log it under "Decisions" in tasks.md.
- Stop early ONLY for: deleting data, schema changes, adding paid services or secrets, or out-of-scope work. Ask in one line.
- If the routing block shows claude5h >= 95% or you hit the Claude limit: commit, update tasks.md, and reply with one line: "Run `/resume <feature>` after the reset, or `/build <feature> --codex` now."
- When all tasks are ticked or blocked: reply in <= 5 lines and suggest `/check <feature>`.
