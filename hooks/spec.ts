import type { EngineInterface } from 'claude-code'
import type { BuildMode, SpecFeature } from '../types'

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

/** Keeps the current selection if it still exists; else the feature on the git branch, the first unfinished, the first, none. */
export const pickFeature = (features: readonly SpecFeature[], current: string | null, branch: string | null): string | null => {
  if (current !== null && features.some(f => f.name === current)) return current
  const onBranch = branch?.startsWith('feature/') ? branch.slice('feature/'.length) : null
  if (onBranch !== null && features.some(f => f.name === onBranch)) return onBranch
  return (features.find(f => f.done < f.total) ?? features[0])?.name ?? null
}

/** Every specs/<name>/tasks.md under cwd except _template, sorted by name; [] when there is no specs folder. */
export async function readFeatures($: EngineInterface, cwd: string): Promise<SpecFeature[]> {
  const root = `${cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/specs`
  let dirs: string[]
  try {
    dirs = (await $.fs.list(root)).filter(x => x.kind === 'dir' && x.name !== '_template').map(x => x.name).sort()
  } catch {
    return []
  }
  const found: SpecFeature[] = []
  for (const name of dirs) {
    try {
      found.push({ name, ...parseTasks((await $.fs.read(`${root}/${name}/tasks.md`)) as string) })
    } catch { /* no tasks.md yet */ }
  }
  return found
}

/** True/false only when installed_plugins.json parses and lists plugins; null (unknown) otherwise. */
export const codexInstalledIn = (text: string | undefined): boolean | null => {
  try {
    const plugins = (JSON.parse(text ?? '') as { plugins?: unknown }).plugins
    if (plugins === null || typeof plugins !== 'object' || Array.isArray(plugins)) return null
    return Object.keys(plugins).some(k => k.startsWith('codex@'))
  } catch {
    return null
  }
}
