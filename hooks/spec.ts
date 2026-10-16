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
