# usage-hud

## Autopilot & Budget Defense (Local Update)

Never waste your subscription or hit an abrupt limit block. Usage HUD now includes a full proactive **Autopilot** that manages your rate limits and context automatically:

| Feature | Default | What it does |
| --- | --- | --- |
| **Auto-switch Engine** | `85%` | When your 5-hour Claude limit hits 85%, engine automatically flips to Codex CLI with a toast notification. |
| **Auto-downgrade Model** | `Enabled` | At 70% 5h usage: downgrades `opus` → `sonnet`. At 85%: downgrades to `haiku`. Automatically restores your original model once the limit resets. |
| **Auto-compact Context** | `85%` | Automatically triggers `/compact` when context reaches 85%, preventing sudden forced session restarts. |
| **Codex Auto-fallback** | `Enabled` | When Claude hits 100%, typing a prompt no longer blocks with an error; it routes immediately to Codex CLI with shared conversation context. |

### Autopilot Controls & Commands

You can toggle or tune Autopilot either by clicking **Auto** in the HUD bar or using terminal commands:

- Click **`Auto: ✦ on / off`** in the HUD controls row to toggle all autopilot features with one click.
- `/usage-hud auto` or `/usage-hud auto status` — view current autopilot settings and thresholds.
- `/usage-hud auto on` — enable all autopilot features with recommended defaults.
- `/usage-hud auto off` — disable all autopilot features.
- `/usage-hud auto switch <50-99|off>` — set the 5h threshold to flip to Codex (e.g. `/usage-hud auto switch 85`).
- `/usage-hud auto downgrade <on|off>` — enable or disable tiered model downgrade (Opus → Sonnet @ 70%, → Haiku @ 85%).
- `/usage-hud auto compact <50-99|off>` — set the context threshold for auto-compaction (e.g. `/usage-hud auto compact 85`).
- `/usage-hud auto fallback <on|off>` — enable or disable auto-fallback to Codex when Claude hits 100%.

### Safety notes

- **Automatic switches are read-only.** When Autopilot moves you to Codex (threshold or 100% fallback), Codex runs in a read-only sandbox. Only a switch you make yourself (`/usage-hud engine codex`) lets Codex edit the project.
- **Unknown Codex capacity never triggers a switch.** If the HUD has no Codex limit reading, Autopilot stays on Claude and says so.
- **The handoff includes the conversation, tool inputs and results.** Secrets are redacted only by pattern. Do not switch to Codex after Claude has read credential files.
- **Known limits:** the "Codex is busy" flag is shared by the whole process and there is no cancel button; a hung Codex run blocks switching until it ends or the plugin reloads.

---

## Spec workflow controls

For projects using `/spec`, `/build`, `/check` and `/resume` (see `CLAUDE.md`). The panel reads `specs/*/tasks.md` after every turn.

- **NOW → spec**: selected feature, progress bar, done/total, blocked count and the next open task.
- **Feat**: cycles the features (the `feature/<name>` branch is picked by default).
- **Build**: cycles `split` → `claude` → `codex`; shown as `split (try claude)` when a limit suggests another mode.
- **/spec /build /check /resume**: put the command in the prompt box (never send it); `/build` and `/resume` carry the Build flag.
- A warning shows in NOW when the Codex plugin is not installed.

---

## Direct engine switch

Click **Engine** in the HUD, or run these local commands in Claude Code:

- `/usage-hud engine codex` — send subsequent typed prompts straight to the Codex CLI.
- `/usage-hud engine claude` — return to Claude with Codex work recorded in the conversation.
- `/usage-hud engine status` — show the selected engine, saved Codex thread, and any interrupted request.

While the engine is Codex, the **Model** and **Effort** buttons (and `/usage-hud model|effort`) switch Codex's model and effort instead of Claude's, and the next prompt resumes the same Codex thread. Switch back to Claude and they control Claude again. Models: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`. The list is hard-coded, so a model your account can't use fails at the next Codex turn.

This is separate from **Route**, which only controls delegation while Claude is the engine. Direct mode intercepts ordinary prompts locally before they reach Claude. It does not need a Claude model call and does not change Claude's model selector. Commands such as `/help` still run locally as normal.

The first Codex turn receives the available Claude conversation (text, tool calls/results, and any existing compaction summary). Later turns resume the same saved Codex thread and send only new Claude conversation. Codex requests and replies are recorded as labeled notes so Claude has them when you switch back. Selection and thread identity are stored per Claude session and project, including after restart. Switching to another project resets the worker association.

Codex uses your existing CLI login and its own usage allowance. This does not remove either provider's limits. No API key or paid-credit fallback is configured. Direct Codex can edit the current project with the workspace-write sandbox; Claude Plan mode selects read-only. Operations requiring escalation fail rather than bypassing the sandbox. Codex uses its own tools and permissions, not Claude's tool integrations.

---

### Live Codex limits

The HUD and the routing block show Codex's real 5h and weekly usage. Codex's session logs miss every `codex exec --ephemeral` run, so the HUD asks Codex directly (`codex app-server`, `account/rateLimits/read`) through a small helper:

```
mkdir -p ~/.claude/delegation
cp codex-limits.mjs ~/.claude/delegation/codex-limits.mjs
```

Without the helper the HUD falls back to the session logs, which can be stale; a window that has reset since the last reading is shown as unknown, not 0%. Requires Node and a logged-in Codex CLI (`codex login`).

### Limit-aware delegation

Each prompt carries `usage claude5h=… claudeWeek=… codex5h=… codexWeek=… pressure=<low|medium|high|unknown>`. Pressure is the fuller of Claude's two windows (low under 60%, medium under 85%, high above; a missing window is unknown, never low). Rules in your `~/.claude/CLAUDE.md` can scale delegation to it. The HUD only supplies the numbers.

### Develop / verify

```
claude plugin validate .
claude plugin test .
```

Then run `/reload-plugins` in Claude Code.

---

## Features Overview

A Claude Code mod that draws an interactive card above the prompt:

- **Rings** for the 5h limit, the 7 day limit and the context window, each with % used and when it resets
- **Pace forecast** under the 5h ring: when you hit the limit at the current pace, or "safe till reset"
- **Compact now** under the context ring once it is 80% full (or automated at 85% with Autopilot)
- **NOW**: model · effort · git branch, task progress with an ETA, session cost, turns, tools and uptime, and today's total across sessions
- **CONTROLS**:
  - **Theme**: cycle `classic → nord → mocha → claude`
  - **Model**: cycle `auto → opus → sonnet → haiku → fable`
  - **Effort**: cycle `auto → low → medium → high → xhigh → max`
  - **Mode**: cycle permission modes
  - **Route**: cycle delegation `auto → claude → codex`
  - **Codex / Cx eff**: pick model and reasoning effort passed to `codex exec`
  - **Engine**: toggle direct engine `claude` / `codex`
  - **Auto**: toggle Autopilot `✦ on` / `off`
- **Worker & Codex** readings: shows Codex 5h/weekly limits and background worker statuses
## Install

```
/plugin install usage-hud --marketplace murad-geoAi/usage-hud
```

## Command Reference

| Command | Description |
| --- | --- |
| `/usage-hud` | Toggle HUD visibility |
| `/usage-hud auto [on\|off\|status\|switch\|downgrade\|compact\|fallback]` | Configure Autopilot protection |
| `/usage-hud engine <claude\|codex\|status>` | Switch direct prompt execution engine |
| `/usage-hud theme <classic\|nord\|mocha\|claude>` | Change color palette |
| `/usage-hud model <opus\|sonnet\|haiku\|fable\|auto>` | Set Claude model |
| `/usage-hud effort <low\|medium\|high\|xhigh\|max\|auto>` | Set Claude reasoning effort |
| `/usage-hud codex <model\|effort\|default>` | Set the Codex model (e.g. `sol`, `5.6-terra`) or effort (`low`..`max`); same Codex thread continues |
| `/usage-hud mode [name]` | Show or change permission mode |
