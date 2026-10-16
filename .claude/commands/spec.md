---
description: Write spec, plan and tasks for a feature, get a Codex critique, then wait for approval
argument-hint: <idea> [--deep]
---

Idea: $ARGUMENTS

0. If `--deep` is present and you are not running on Opus: reply only "Switch to Opus first: `/model opus`, then rerun `/spec ... --deep`." and stop. Without `--deep`, use the current (Sonnet) model.
1. Ask me up to 5 short, numbered questions that change the design. Then STOP and wait for my answers.
2. After I answer, pick a short kebab-case `<feature-name>`. Copy `specs/_template/` to `specs/<feature-name>/` and fill `spec.md`, `plan.md`, `tasks.md`. Bullets only.
   - Only explore code if needed; use a Haiku Explore subagent that returns paths + line numbers only.
   - `plan.md` "Files to change" must list every file the build may read or edit.
   - Every task gets a size tag [S]/[M]/[L], a "Done when" and a "Test". [S] = one file, clear, < ~50 lines; [M] = a few files; [L] = design decisions or tricky logic.
3. Ask Codex for ONE critique: Agent tool, `subagent_type: "codex:codex-rescue"`, foreground, prompt:
   ```
   Read-only. Do not edit files.
   [TASK] Critique this plan. Do not edit files.
   [CONTEXT] specs/<feature-name>/spec.md and specs/<feature-name>/plan.md (also tasks.md). Project facts are in CLAUDE.md.
   [GOAL] Numbered list of concrete problems, most serious first. Max ~300 words.
   ```
   If the agent is not available, send the same prompt with one Bash call: `node ~/.claude/delegation/delegate.mjs <<'EOF' ... EOF` (timeout 600000; read-only).
   If Codex errors with a usage limit, skip the critique, say so in one line, and continue.
4. Apply the useful points to plan.md/tasks.md; log them under "Codex critique (applied)". Show me a summary of at most 8 lines: goal, task count by size, top Codex points and what changed.
5. STOP. This is the ONLY approval gate. Do not create branches or write code until I approve. On approval, tell me: `/clear`, then `/build <feature-name>`.
