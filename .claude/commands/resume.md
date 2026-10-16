---
description: Show a 3-line status for a feature and continue /build from the first unticked task
argument-hint: <feature-name> [--claude | --codex]
model: opus
---

Feature: $ARGUMENTS

1. Read `specs/<feature>/tasks.md` and `specs/<feature>/report.md` (if it exists). Run `git status --short` and `git log --oneline -5`.
2. Give me a 3-line status: done/total (blocked count), current branch + last commit, next task.
3. Continue exactly as `/build <feature>` (same mode as the `Mode:` line in tasks.md unless I passed a flag), starting at the first unticked, non-BLOCKED task. Follow `.claude/commands/build.md`.
