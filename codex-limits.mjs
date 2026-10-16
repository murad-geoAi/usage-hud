#!/usr/bin/env node
// Print Codex's live 5h and weekly usage as one JSON line, asked of `codex app-server` (account/rateLimits/read).
// The session logs only hold limits when Codex ran interactively, so `codex exec --ephemeral` work never showed up.
// Output: {"fiveHour":{"pct":2,"resetsAt":<ms>}|null,"weekly":{...}|null,"seenAt":<ms>,"plan":"plus"|null}
// Exit 1 with a message on stderr when Codex cannot be reached or answers without limits.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

const TIMEOUT_MS = 15000

// A bare `codex` is searched for in the current directory first on Windows, so a project that ships its own
// codex.cmd could get it run. Resolve it from absolute PATH entries only, and run from the home directory.
const findCodex = () => {
  const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['codex']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue
    for (const name of names) {
      const path = join(dir, name)
      if (existsSync(path)) return path
    }
  }
  return null
}
const bin = findCodex()
if (bin === null) {
  console.error('codex was not found on PATH')
  process.exit(1)
}
const options = { stdio: ['pipe', 'pipe', 'ignore'], cwd: homedir() }
// Node will not start a .cmd/.bat shim without a shell; the command is the resolved path plus a constant.
const child = /\.(cmd|bat)$/i.test(bin)
  ? spawn(`"${bin}" app-server`, { ...options, shell: true })
  : spawn(bin, ['app-server'], options)
const fail = message => {
  console.error(message)
  child.kill()
  process.exit(1)
}
const timer = setTimeout(() => fail('codex app-server did not answer in time'), TIMEOUT_MS)
child.on('error', e => fail(`cannot start codex: ${e.message}`))
child.on('exit', () => fail('codex app-server exited before answering'))

const send = message => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
const window = w =>
  w && typeof w.usedPercent === 'number' && typeof w.resetsAt === 'number'
    ? { pct: w.usedPercent, resetsAt: w.resetsAt * 1000 }
    : null

let buffer = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue // not one of ours
    }
    if (message.id === 1) {
      send({ method: 'initialized' })
      send({ id: 2, method: 'account/rateLimits/read' })
    } else if (message.id === 2) {
      const limits = message.result?.rateLimits
      const out = { fiveHour: window(limits?.primary), weekly: window(limits?.secondary), seenAt: Date.now(), plan: limits?.planType ?? null }
      if (out.fiveHour === null && out.weekly === null) fail('codex answered without limits')
      clearTimeout(timer)
      console.log(JSON.stringify(out))
      child.removeAllListeners('exit')
      child.stdin.end() // the server exits on EOF
      setTimeout(() => process.exit(0), 200)
    }
  }
})
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'usage-hud', version: '0.3.0' } } })
