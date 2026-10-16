# usage-hud

A Claude Code mod that draws a live usage dashboard above the prompt, so you always know how much of your limits you have left and whether you will make it to the reset.

## What it shows

- **5h limit ring.** Percent used, when it resets, a sparkline of recent readings, and a pace forecast from the last 90 minutes: `limit in ~1h` (amber) or `safe till reset`.
- **7 day limit ring.** Percent used, when it resets, and a weekly pace: `on pace for ~62%` by the reset (amber from 85%), or `out ~Thu 14:00` when you would run out first.
- **Context ring.** Tokens used of the window (`36k of 200k`), with a **⟳ compact now** button from 80% full.
- **Codex rings** (175+ columns wide): Codex's own 5h and weekly limits beside Claude's.
- The border turns amber at 85% and red at 95% of any Claude limit.
- **NOW**
  - `model`: model · effort · git branch (`*` when dirty)
  - `tasks`: the todo list's progress, an ETA from recent task times, and the current task
  - `codex`: Codex 5h/weekly limits, the last delegated Codex run, and delegated tokens when there are any
  - `session`: cost, burn rate ($/h after 10 minutes), turns, tool calls, uptime
  - `today`: cost and turns across every session today
- **Idle warning.** After about an hour idle, the prompt cache has expired. A toast tells you how much context the next prompt will re-write, so you can `/compact` or `/clear` first.

## Controls

Click a control, or use the matching command:

| Control | Cycles | Command |
| --- | --- | --- |
| Theme | `classic → nord → mocha → claude` | `/usage-hud theme <name>` |
| Model | `auto → opus → sonnet → haiku` | `/usage-hud model <opus\|sonnet\|haiku\|auto>` |
| Effort | `auto → low → medium → high → xhigh → max` | `/usage-hud effort <level\|auto>` |
| Mode | permission modes | `/usage-hud mode [name]` |
| Deleg. | How much Claude hands to Codex: `auto → off → prefer` (stored as `auto`/`claude`/`codex` in `~/.claude/delegation/routing.json`); prompts always go to Claude | |
| Auto | autopilot on / off | `/usage-hud auto [on\|off\|status\|downgrade <on\|off>\|compact <50-99\|off>]` |

`/usage-hud` alone hides or shows the HUD. `/usage-hud codex <model|effort|default>` sets the model and effort Claude passes to Codex when it delegates.

### Autopilot

- **Downgrade** (off by default, `/usage-hud auto downgrade on`): at 70% of the 5h window, Opus becomes Sonnet. At 85%, the model becomes Haiku. Your model comes back when usage drops under 60%. Picking a model by hand turns this off until then.
- **Compact:** compacts the context at 85% full (configurable), or at 150k tokens, whichever comes first.

Prompts always go to Claude. The HUD never sends a prompt to Codex. Codex runs only when Claude delegates (through `delegate.mjs` or the Codex plugin), and the HUD shows those runs.

## Codex readings (optional)

Codex's session logs miss `codex exec --ephemeral` runs, so for live numbers the HUD asks Codex directly through a small helper:

```
mkdir -p ~/.claude/delegation
cp codex-limits.mjs ~/.claude/delegation/codex-limits.mjs
```

Without the helper, the HUD reads the newest Codex session log. A window that has reset since that reading shows as unknown, not 0%. Requires Node and a logged-in Codex CLI (`codex login`).

`delegate.mjs` sends a task to `codex exec` read-only and appends each run to `~/.claude/delegation/runs/ledger.jsonl`. The `codex` row shows those tokens as `delegated … session · … today`.

Each prompt also carries a `[delegation-routing] … usage claude5h=… claudeWeek=… codex5h=… codexWeek=… pressure=…` line, so rules in your `~/.claude/CLAUDE.md` can decide when delegating is worth it.

## Install

```
/plugin install usage-hud --marketplace murad-geoAi/usage-hud
```

## Develop

```
claude plugin validate .
claude plugin test .
```

Then run `/reload-plugins` in Claude Code.
