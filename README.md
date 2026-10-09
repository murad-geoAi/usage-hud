# usage-hud

A Claude Code mod that draws a card above the prompt:

- **Rings** for the 5h limit, the 7 day limit and the context window, each with % used and when it resets
- **Pace forecast** under the 5h ring: when you hit the limit at the current pace, or "safe till reset"
- **Compact now** under the context ring once it is 80% full
- **NOW**: model · effort · git branch, task progress with an ETA, and session cost, turns, tools and uptime, and today's cost and turns across all sessions
- **CONTROLS**: click to change the theme (classic, nord, mocha, claude), model, effort and permission mode

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
