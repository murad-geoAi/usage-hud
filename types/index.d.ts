export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Tasks = {
  total: number
  completed: number
  current: string | null
}

export type ModelInfo = { model: string; effort: string | number | null }

export type ThemeName = 'classic' | 'mocha' | 'nord' | 'claude'

export type EffortName = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One reading of the 5h window: when (epoch ms) and how full. */
export type UsageSample = { t: number; pct: number }

/** Cost and turns across every session of one local day. */
export type DayTotals = { date: string; cost: number; turns: number }

export type GitInfo = { branch: string; dirty: boolean }

/** Whether Claude delegates to the Codex worker CLI, and how readily; not Claude's own model. */
export type RouteName = 'auto' | 'claude' | 'codex'

/** Codex CLI (`codex exec`) is the only worker. */
export type WorkerName = 'codex'

/** One Codex rate-limit window: percent used and when it resets (epoch ms). */
export type CodexWindow = { pct: number; resetsAt: number }

/** Codex's own limits, from the newest ~/.codex/sessions rollout that recorded them. */
export type CodexLimits = { fiveHour: CodexWindow | null; weekly: CodexWindow | null; seenAt: number; plan: string | null }

/** A `codex exec` Bash call seen in flight. */
export type WorkerRun = { name: WorkerName; startedAt: number }

/** How the last observed worker call ended, as the Bash tool reported it. */
export type WorkerDone = { name: WorkerName; ms: number; outcome: 'ok' | 'failed' | 'denied' }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      directEngine: 'claude' | 'codex'
      directStatus: string
      limits: Limit[]
      model: ModelInfo | null
      tasks: Tasks | null
      /** Durations (ms) of the last finished tasks, newest last. */
      durations: number[]
      /** When each in-progress task began, by its content (epoch ms). */
      startedAt: Record<string, number>
      /** When the last task finished, or the list was first seen (epoch ms). */
      lastMark: number
      isHidden: boolean
      theme: ThemeName
      /** Recent 5h-window readings, newest last; the sparkline and the pace forecast. */
      samples: UsageSample[]
      today: DayTotals | null
      /** The session cost already added to today's total. */
      costSeen: number
      /** Context window fill, 0 to 100, or null before the first reading. */
      context: number | null
      git: GitInfo | null
      /** Model id the HUD forces on the main thread; null follows the session. */
      modelOverride: string | null
      /** Effort the HUD forces on the main thread; null follows the session. */
      effortOverride: EffortName | null
      /** The permission mode last read from or written to /config. */
      modeLabel: string | null
      /** Context window size in tokens, null before a reading. */
      contextWindow: number | null
      /** Session cost in US dollars, null before a reading. */
      cost: number | null
      turns: number
      toolCalls: number
      /** When the session began (epoch ms), 0 before the first reading. */
      sessionStart: number
      /** The delegation routing preference, as last read from or written to routing.json. */
      route: RouteName
      /** The worker call running now, null when none is seen. */
      worker: WorkerRun | null
      /** The last worker call that finished in this session. */
      lastWorker: WorkerDone | null
      /** routing.json's codexModel: the model Claude passes to `codex exec -m`; null is the account default. */
      codexModel: string | null
      /** routing.json's codexEffort: passed as `-c model_reasoning_effort=`; null is Codex's default. */
      codexEffort: EffortName | null
      /** Codex's 5h and weekly limits as last read, null when none was found. */
      codexLimits: CodexLimits | null
      /** Codex tokens delegated this session and today, from runs/ledger.jsonl; null when nothing is readable. */
      savings: { session: number; today: number } | null
      /** Which session the Saved line counts: its Claude Code ID (null = count from the first render). */
      savingsScope: { id: string | null; since: number } | null
      autoConfig: { switchThreshold: number; downgradeEnabled: boolean; compactThreshold: number; fallbackEnabled: boolean }
      autoSwitched: boolean
      /** The user chose Claude by hand: autopilot keeps off Codex until the limit drops below 50%. */
      switchSuppressed: boolean
      autoOrigModel: string | null
      autoDownDisabled: boolean
      autoCompacted: boolean
    }
  }
}
