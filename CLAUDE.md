# usage-hud

## Project facts
- Stack: Claude Code plugin (mod). TypeScript hooks in `hooks/` (`register.tsx`, `direct.ts`), Node ESM helpers (`delegate.mjs`, `codex-limits.mjs`, `install-local.mjs`). No package.json, no npm deps.
- Run: `/reload-plugins` inside Claude Code (installed via `.claude-plugin/marketplace.json`).
- Test: `claude plugin test .` (runs `hooks/*.test.ts`, imports from `claude-code/testing`).
- Lint/validate: `claude plugin validate .`
- Remote: `origin` = https://github.com/murad-geoAi/usage-hud.git, default branch `main`.
- Platform: Windows (Git Bash + PowerShell).

## Workflow (spec-driven)
- `/spec <idea> [--deep]` -> `specs/<feature>/{spec,plan,tasks}.md`, Codex critiques the plan, then the ONLY approval gate.
- `/build <feature> [--claude|--codex]` -> branch `feature/<feature>`, works through tasks.md without questions.
- `/check <feature>` -> one Codex review, fixes, `report.md`, push the feature branch.
- `/resume <feature>` -> status + continue the build.
- Roles: Claude writes specs/plans/tasks, [M]/[L] code, runs tests, pushes. Codex critiques plans, reviews features, writes [S] code, takes over tasks that failed twice.
- Never let Claude and Codex work on the same task at the same time.
- Codex calls in this repo go through the `codex:codex-rescue` agent (plugin openai/codex-plugin-cc). Prompts use `[TASK] / [CONTEXT] / [GOAL]`.

## Cost rules
- $0 extra spending. Never use Fable models. Never suggest usage credits or an API key.
- Sonnet is the default for everything. Opus only for `/spec --deep`.
- For searching the codebase, use a Haiku subagent (Explore, model haiku) and bring back only the relevant file paths and lines.
- Read only files listed in plan.md unless you must explore. Do not re-read files.
- Codex reviews once per spec and once per feature, never per task. Never enable the Codex review gate.
- If Codex returns a usage-limit error, do not retry: switch the rest of the build to `--claude` mode and tell me.
- If I hit my Claude limit (or the routing block shows claude5h >= 95%), stop cleanly: commit, update tasks.md, and write one line telling me to run `/resume <feature>` after the reset or `/build <feature> --codex` now.
- Keep specs to bullet points. Keep messages to me short.
- One feature per session: remind me to `/clear` before starting a new feature. Suggest `/compact` when a session gets long.
- Tests are the proof of "done". Never tick a task with a failing test.
- Never push to `main` from a feature workflow, never force push.
