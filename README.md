# usage-hud

A Claude Code mod that draws a card above the prompt:

- **Rings** for the 5h limit, the 7 day limit and the context window, each with % used and when it resets
- **Pace forecast** under the 5h ring: when you hit the limit at the current pace, or "safe till reset"
- **Compact now** under the context ring once it is 80% full
- **NOW**: model · effort · git branch, task progress with an ETA, and session cost, turns, tools and uptime, and today's cost and turns across all sessions
- **CONTROLS**: click to change the theme (classic, nord, mocha, claude), model, effort and permission mode
- **Route** (delegation to OpenAI Codex): click to cycle `auto → claude → codex`
- **Codex** / **Cx eff**: click to pick the model and reasoning effort Claude passes to `codex exec` (`default` is your Codex account's own)
- **worker** (in NOW): a `codex exec` call Claude is running now, or how the last one ended (`ok`, `failed`, `denied`)
- **codex** (in NOW): your Codex 5h and weekly limits; from 175 columns also as two more rings

### Route, Codex and worker

Route is a *preference for how readily Claude hands work to the Codex CLI*. It does not change Claude Code's model, which stays the Model control's.

- `auto`: Claude delegates hard reasoning, reviews and stuck debugging. `claude`: no delegation unless you ask. `codex`: heavy offload, where Codex does the planning, debugging, review and analysis, and Claude only edits, runs commands and checks.
- The values live in `~/.claude/delegation/routing.json` (`preference`, `codexModel`, `codexEffort`). Each typed prompt carries them to Claude as hidden context, and the rules that act on them are in `~/.claude/CLAUDE.md`.
- `node ~/.claude/delegation/route.mjs [auto|claude|codex|status]` sets the route from a terminal. The HUD picks the change up at the next prompt.
- The codex row reads the newest `~/.codex/sessions` rollout that recorded limits, and says when that was ("as of"). Claude's own worker calls run `--ephemeral` and record none, so the reading comes from your last Codex app or CLI session.
- Without `routing.json` the HUD shows `auto` and `default`, and the card works as before.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-hud --marketplace murad-geoAi/usage-hud
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every project.

## Use

| Command | Does |
| --- | --- |
| `/usage-hud` | Hide or show the card |
| `/usage-hud theme <classic\|nord\|mocha\|claude>` | Change the colours |
| `/usage-hud model <opus\|sonnet\|haiku\|fable\|auto>` | Use that model from the next request |
| `/usage-hud effort <low\|medium\|high\|xhigh\|max\|auto>` | Use that effort from the next request |
| `/usage-hud mode [name]` | Show or change the permission mode |

## Update

After pulling a new version on a machine: `claude plugin update usage-hud`, then `/reload-plugins`.
