#!/usr/bin/env node
// Apply this tested local update to the installed Usage HUD, backing up every overwritten file.
import { readFile, writeFile, mkdir, copyFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = dirname(fileURLToPath(import.meta.url))
const claude = join(homedir(), '.claude')
const files = ['hooks/register.tsx', 'hooks/direct.ts', 'hooks/savings.ts', 'hooks/register.test.ts', 'hooks/direct.test.ts', 'hooks/savings.test.ts', 'types/index.d.ts', 'README.md', '.claude-plugin/plugin.json']
const registry = JSON.parse(await readFile(join(claude, 'plugins/installed_plugins.json'), 'utf8'))
const installs = registry.plugins?.['usage-hud@my-mods'] ?? []
if (installs.length !== 1 || installs[0].scope !== 'user') throw new Error('Expected one user-scoped usage-hud@my-mods installation. No files were changed.')
const targets = [join(claude, 'my-mods/usage-hud'), installs[0].installPath]
const root = await realpath(claude)
for (const target of targets) {
  const actual = await realpath(target)
  const rel = relative(root, actual)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Installation target is outside .claude: ' + actual)
  const manifest = JSON.parse(await readFile(join(actual, '.claude-plugin/plugin.json'), 'utf8'))
  if (manifest.name !== 'usage-hud') throw new Error('Wrong plugin at ' + actual)
}
const backup = join(claude, 'backups', 'usage-hud-direct-' + new Date().toISOString().replace(/[:.]/g, '-'))
const records = []
// Read all source files before changing the installation.
const contents = await Promise.all(files.map(file => readFile(join(source, file))))
for (const [index, target] of targets.entries()) {
  for (const [f, file] of files.entries()) {
    const output = join(target, file)
    const saved = join(backup, String(index), file)
    let existed = true
    try { await stat(output) } catch (e) { if (e.code !== 'ENOENT') throw e; existed = false }
    if (existed) {
      // Resolve existing files too: never write through a symlink outside the intended install.
      const rel = relative(await realpath(target), await realpath(output))
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('File escapes installation: ' + output)
      await mkdir(dirname(saved), { recursive: true })
      await copyFile(output, saved)
    }
    records.push({ output, saved: existed ? saved : null })
    await mkdir(backup, { recursive: true })
    await writeFile(join(backup, 'manifest.json'), JSON.stringify(records, null, 2))
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, contents[f])
  }
}
// The live Codex limit helper lives beside routing.json, where the HUD looks for it.
const helperSource = await readFile(join(source, 'codex-limits.mjs'))
const helperTarget = join(claude, 'delegation', 'codex-limits.mjs')
let helperExisted = true
try { await stat(helperTarget) } catch (e) { if (e.code !== 'ENOENT') throw e; helperExisted = false }
if (helperExisted) {
  await mkdir(join(backup, 'delegation'), { recursive: true })
  await copyFile(helperTarget, join(backup, 'delegation', 'codex-limits.mjs'))
}
await mkdir(dirname(helperTarget), { recursive: true })
await writeFile(helperTarget, helperSource)
console.log('Usage HUD direct engine installed. Backup: ' + backup)
console.log('Run /reload-plugins in Claude Code, then /usage-hud engine codex.')
console.log('Use /usage-hud engine claude to return. The same conversation stays available.')
