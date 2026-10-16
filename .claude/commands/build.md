---
description: Build an approved feature task by task on feature/<name>, with Codex taking [S] tasks
argument-hint: <feature-name> [--claude | --codex]
model: sonnet
---

Arguments: $ARGUMENTS

Setup
- Read CLAUDE.md "Project facts", then `specs/<feature>/spec.md`, `plan.md`, `tasks.md` once. Read only files listed in plan.md unless you must explore (Haiku Explore subagent, paths + lines only). Do not re-read files.
- `git switch feature/<feature>` if it exists, else `git switch -c feature/<feature>` from `main`. Working tree must be clean; if not, commit WIP first.
- Write the mode at the top of tasks.md (`Mode: split|claude|codex`).

Mode
- Default (split): [S] -> Codex at low effort; [M] and [L] -> you.
- `--claude`: you write every task.
- `--codex`: Codex writes every task at medium effort; you only run tests, tick and commit.

Sending a task to Codex
- Agent tool, `subagent_type: "codex:codex-rescue"`, `run_in_background: true`, ONE Codex task at a time. Prompt:
  ```
  --effort <low|medium|high> --write
  [TASK] <task line from tasks.md>
  [CONTEXT] Spec: specs/<feature>/spec.md. Files: <paths from plan.md>. Done when: <...>. Test: <command>.
  [GOAL] Make the change in those files only. Do not commit. Reply with changed files and test result in <= 10 lines.
  ```
- While it runs, work on a task that does not depend on it and does not touch the same files. Never work on the task Codex has.
- If the `codex:codex-rescue` agent is not available (plugin not installed): Codex cannot write code here, so switch the build to `--claude` and tell me in one line.
- If Codex reports a usage-limit error: do not retry. Switch the remaining build to `--claude` and tell me in one line.

For every task
1. Implement (or receive Codex's result and inspect `git diff`).
2. Run the test and lint commands from Project facts. Never tick a task with a failing test.
3. Tick it in tasks.md, then `git add` the task's files + tasks.md and commit `feat(<feature>): <task>`.

Failures
- A task fails twice -> hand it to the other model (Claude -> Codex at `--effort high`; Codex -> you).
- Fails again -> mark `BLOCKED: <error, one line>` in tasks.md (and under "Blocked"), commit, move on.

Rules
- Do not ask me questions. Pick the option closest to the spec and log it under "Decisions" in tasks.md.
- Stop early ONLY for: deleting data, schema changes, adding paid services or secrets, or out-of-scope work. Ask in one line.
- If the routing block shows claude5h >= 95% or you hit the Claude limit: commit, update tasks.md, and reply with one line: "Run `/resume <feature>` after the reset, or `/build <feature> --codex` now."
- When all tasks are ticked or blocked: reply in <= 5 lines and suggest `/check <feature>`.
