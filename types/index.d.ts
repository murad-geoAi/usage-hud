export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Tasks = {
  total: number
  completed: number
  current: string | null
}

export type ModelInfo = { model: string; effort: string | number | null }

export type ThemeName = 'classic' | 'mocha' | 'nord' | 'claude'

export type EffortName = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type GitInfo = { branch: string; dirty: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
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
      /** Recent 5h-window percentages, newest last. */
      history: number[]
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
    }
  }
}
