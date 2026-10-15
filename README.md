# usage-hud

A Claude Code mod that draws a card above the prompt:

- **Rings** for the 5h limit, the 7 day limit and the context window, each with % used and when it resets
- **Pace forecast** under the 5h ring: when you hit the limit at the current pace, or "safe till reset"
- **Compact now** under the context ring once it is 80% full
- **NOW**: model · effort · git branch, task progress with an ETA, and session cost, turns, tools and uptime, and today's cost and turns across all sessions
- **CONTROLS**: click to change the theme (classic, nord, mocha, claude), model, effort and permission mode
- **Route** (delegation): click to cycle the routing preference `auto → claude → codex → gemini`
- **worker** (in NOW): a `codex exec` / `agy -p` call Claude is running now, or how the last one ended (`ok`, `failed`, `denied`)

### Route and worker

Route is a *preference for which worker CLI Claude delegates to*. It does not change Claude Code's model, which stays the Model control's.

- The value lives in `~/.claude/delegation/routing.json` (`preference`). Each typed prompt carries it to Claude as hidden context, and the rules that act on it are in `~/.claude/CLAUDE.md`.
- `node ~/.claude/delegation/route.mjs [auto|claude|codex|gemini|status]` sets it from a terminal. The HUD picks the change up at the next prompt.
- The worker row shows only what the Bash tool reports for foreground calls that begin with `codex exec` or `agy -p` (Antigravity CLI, shown as `gemini`). It shows no usage, quota or token figures for the workers.
- Without `routing.json` the HUD shows `auto`, and the card works as before.

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
