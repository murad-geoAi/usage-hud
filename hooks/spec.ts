export type TaskStats = { done: number; total: number; blocked: number; next: string | null }

const TASK_LINE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/

/** Counts the checkbox lines of a tasks.md; next is the first unticked, non-blocked task without its tag. */
export const parseTasks = (text: string): TaskStats => {
  const stats: TaskStats = { done: 0, total: 0, blocked: 0, next: null }
  for (const line of text.split(/\r?\n/)) {
    const m = TASK_LINE.exec(line)
    if (m === null) continue
    stats.total++
    if (m[1] !== ' ') { stats.done++; continue }
    if (m[2].includes('BLOCKED')) { stats.blocked++; continue }
    if (stats.next === null) stats.next = m[2].replace(/\s*\[[SML]\]\s*/, ' ').replace(/\s+/g, ' ').trim()
  }
  return stats
}

export type BuildMode = 'split' | 'claude' | 'codex'
export const BUILD_MODES: readonly BuildMode[] = ['split', 'claude', 'codex']
export type SpecAction = 'spec' | 'build' | 'check' | 'resume'

/** Unknown or stale stored values read as split. */
export const asBuildMode = (x: unknown): BuildMode => (BUILD_MODES as readonly unknown[]).includes(x) ? (x as BuildMode) : 'split'

/** The slash command a button puts in the prompt box; null when the action needs a feature and has none. */
export const buildCommand = (action: SpecAction, feature: string | null, mode: BuildMode): string | null => {
  if (action === 'spec') return '/spec '
  if (feature === null) return null
  if (action === 'check') return `/check ${feature}`
  return `/${action} ${feature}${mode === 'split' ? '' : ` --${mode}`}`
}

const HIGH = 85

/** A mode worth suggesting, or null. Unknown (null) windows are ignored; Codex pressure beats Claude pressure. */
export const suggestMode = (
  claude5h: number | null,
  codexPcts: readonly (number | null)[],
  codexInstalled: boolean | null,
): BuildMode | null => {
  if (codexInstalled === false || codexPcts.some(p => p !== null && p >= HIGH)) return 'claude'
  if (claude5h !== null && claude5h >= HIGH) return 'codex'
  return null
}
