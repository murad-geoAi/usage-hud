---
description: One Codex review of the feature branch, fix, write report.md, push the branch
argument-hint: <feature-name>
model: opus
---

Feature: $ARGUMENTS

1. Make sure you are on `feature/<feature>` with a clean tree. Ask Codex for ONE review with one Bash call (timeout 600000), `node ~/.claude/delegation/delegate.mjs --mode read <<'EOF' ... EOF`, prompt:
   ```
   Read-only. Do not edit files.
   [TASK] Review branch feature/<feature> (git diff main...HEAD) against the acceptance criteria.
   [CONTEXT] specs/<feature>/spec.md (Acceptance criteria), specs/<feature>/tasks.md. Test command in CLAUDE.md.
   [GOAL] Numbered list of real bugs and unmet acceptance criteria, most serious first, with file:line. No style nits. Max ~400 words.
   ```
   If it fails or hits a usage limit, tell me to run `/codex:review --base main` and paste the result, then continue from step 2 with it.
2. Fix the real issues only (verify each claim against the code first). Re-run tests and lint. Commit `fix(<feature>): address review`.
3. Write `specs/<feature>/report.md` (bullets): Built; Acceptance criteria with pass/fail each; Decisions; Blocked tasks; Test result. Commit `docs(<feature>): report`.
4. If tests pass: `git push -u origin feature/<feature>`. Never push to main. Never force push. If tests fail, do not push; say why in one line.
5. Reply in <= 5 lines. Remind me to `/clear` before the next feature.
