#!/usr/bin/env node
// One-call Codex delegation: task text on stdin (or a file path argument), result on stdout.
//   node ~/.claude/delegation/delegate.mjs --mode read <<'EOF'        survey code/docs/logs; Codex is read-only, low effort
//   node ~/.claude/delegation/delegate.mjs --mode implement <<'EOF'   Codex edits the project; you get its summary and a diff
// Model comes from routing.json; effort is codexEffort for implement and codexReadEffort (default low) for read.
// Before running, Codex's own limits are checked: at 85% or more nothing runs (exit 3) so Claude does the work itself.
// Every run is appended to runs/ledger.jsonl (Codex's token usage vs. what Claude paid) for the Usage HUD.
// Exit: 0 ok, 1 Codex failed, 2 bad call, 3 Codex near its limit.
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, relative, resolve } from 'node:path'

const MAX_ANSWER = 3000
const MAX_DIFF = 7000
const CODEX_LIMIT = 85
const DIR = join(homedir(), '.claude', 'delegation')
const RUNS = join(DIR, 'runs')
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// ---- arguments ----------------------------------------------------------------
const argv = process.argv.slice(2)
let mode = 'read'
let fileArg = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--mode') mode = argv[++i]
  else if (argv[i].startsWith('--mode=')) mode = argv[i].slice(7)
  else fileArg = argv[i]
}
const die = (code, message) => {
  console.error(`delegate: ${message}`)
  process.exit(code)
}
if (mode !== 'read' && mode !== 'implement') die(2, `unknown mode "${mode}" (use read or implement).`)
const task = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8')
if (task.trim() === '') die(2, 'empty task (send it on stdin).')
const cwd = process.cwd()
if (mode === 'implement' && (resolve(cwd) === resolve(homedir()) || resolve(cwd) === parse(resolve(cwd)).root))
  die(2, `refusing to let Codex edit ${cwd}: run it from the project folder.`)

// ---- routing ------------------------------------------------------------------
const routing = (() => {
  try {
    const v = JSON.parse(readFileSync(join(DIR, 'routing.json'), 'utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
})()
const model = typeof routing.codexModel === 'string' && /^[\w.-]+$/.test(routing.codexModel) ? routing.codexModel : null
const effort = mode === 'implement'
  ? (EFFORTS.includes(routing.codexEffort) ? routing.codexEffort : 'medium')
  : (EFFORTS.includes(routing.codexReadEffort) ? routing.codexReadEffort : 'low')

// ---- Codex's own limits -------------------------------------------------------
let limitNote = 'Codex limits unknown'
const helper = join(DIR, 'codex-limits.mjs')
if (existsSync(helper)) {
  const r = spawnSync(process.execPath, [helper], { encoding: 'utf8', timeout: 20_000 })
  try {
    const x = JSON.parse(r.stdout.trim().split('\n').pop())
    const now = Date.now()
    const pct = w => (w && typeof w.pct === 'number' && !(w.resetsAt <= now) ? w.pct : null)
    const [h5, wk] = [pct(x.fiveHour), pct(x.weekly)]
    limitNote = `Codex 5h ${h5 ?? '?'}% · week ${wk ?? '?'}%`
    if ((h5 ?? 0) >= CODEX_LIMIT || (wk ?? 0) >= CODEX_LIMIT) die(3, `Codex is near its own limit (${limitNote}). Do this in Claude and tell the user.`)
  } catch {
    // unreadable reading: run anyway, the note says unknown
  }
}

// ---- snapshot (implement): works with or without git ---------------------------
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', 'dist', 'build', 'out', 'target', 'coverage', '.cache', '.idea', '.vs'])
const MAX_TEXT = 512 * 1024
const MAX_FILES = 20_000
const snapshot = () => {
  const files = new Map()
  const walk = dir => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (files.size >= MAX_FILES) return
      const full = join(dir, e.name)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue }
      if (!e.isFile()) continue
      let st
      try { st = lstatSync(full) } catch { continue }
      let text = null
      if (st.size <= MAX_TEXT) {
        try {
          const buf = readFileSync(full)
          if (!buf.includes(0)) text = buf.toString('utf8')
        } catch { /* unreadable: tracked by size and time only */ }
      }
      files.set(relative(cwd, full), { size: st.size, mtime: st.mtimeMs, text })
    }
  }
  walk(cwd)
  return files
}
const before = mode === 'implement' ? snapshot() : null

// ---- run Codex ----------------------------------------------------------------
const PREAMBLE = {
  read: 'You are a read-only research worker for Claude. Answer the task from the files and text given. Be concise, findings first, cite path:line or source+page, and write "not found" rather than guessing.\n\n',
  implement: 'You are the implementation worker for Claude, who planned this change. Edit files in the current project to implement the task exactly; do not refactor or touch unrelated files. Verify current files before editing. Run a quick check if one exists (build, tests, lint) and fix what you broke. End your answer with three short sections: SUMMARY (<=8 lines), CHECKS (what you ran and the result), OPEN (anything unfinished or doubtful). Do not paste the code; Claude sees the diff.\n\n',
}[mode]

mkdirSync(RUNS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = join(RUNS, `${stamp}.${mode}.out.md`)
const args = ['exec']
if (model) args.push('-m', model)
args.push('-c', `model_reasoning_effort=${effort}`)
args.push('--sandbox', mode === 'implement' ? 'workspace-write' : 'read-only')
// The elevated Windows sandbox cannot start under Claude Code's process: Codex then cannot write or run anything.
if (process.platform === 'win32') args.push('-c', 'windows.sandbox="unelevated"')
if (mode === 'implement') args.push('-c', 'approval_policy="never"')
args.push('--skip-git-repo-check', '--ephemeral', '--color', 'never', '--json', '-C', cwd, '-o', out, '-')

// npm on Windows exposes a .cmd shim: run its JS entry with Node, no shell.
const entry = process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : ''
const [cmd, cmdArgs] = entry && existsSync(entry) ? [process.execPath, [entry, ...args]] : ['codex', args]
const started = Date.now()
const run = spawnSync(cmd, cmdArgs, { input: PREAMBLE + task, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 590_000, shell: false })
const ms = Date.now() - started

// Token usage and messages from the JSON event stream.
const usage = { input: 0, cached: 0, output: 0 }
const messages = []
for (const line of (run.stdout ?? '').split('\n')) {
  if (!line.trim().startsWith('{')) continue
  try {
    const e = JSON.parse(line)
    if (e.type === 'turn.completed' && e.usage) {
      usage.input += e.usage.input_tokens ?? 0
      usage.cached += e.usage.cached_input_tokens ?? 0
      usage.output += e.usage.output_tokens ?? 0
    }
    if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') messages.push(e.item.text)
  } catch { /* not an event */ }
}

// The Usage HUD's "Saved" line reads this ledger. Every append also drops lines older than 30 days.
const LEDGER = join(RUNS, 'ledger.jsonl')
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const taskName = (task.split('\n').find(l => l.trim().startsWith('[TASK]')) ?? '').replace(/^\s*\[TASK\]\s*/, '').trim().slice(0, 80) || 'unknown'
const session = (process.env.CLAUDE_CODE_SESSION_ID ?? '').trim()

const ledger = fields => {
  try {
    const now = Date.now()
    const kept = existsSync(LEDGER)
      ? readFileSync(LEDGER, 'utf8').split('\n').filter(line => {
        try {
          const e = JSON.parse(line)
          return typeof e?.at === 'number' && now - e.at <= KEEP_MS
        } catch { return false }
      })
      : []
    const entry = { at: now, task: taskName, ...(session ? { session } : {}), mode, cwd, ms, model, effort, codexTokens: usage, ...fields }
    mkdirSync(RUNS, { recursive: true })
    writeFileSync(LEDGER, [...kept, JSON.stringify(entry)].join('\n') + '\n')
  } catch { /* measurement must never fail the run */ }
}

const answer = (existsSync(out) ? readFileSync(out, 'utf8') : messages.join('\n\n')).trim()
if (run.error || run.status !== 0 || answer === '') {
  const why = (run.error?.message ?? run.stderr ?? '').toString().slice(-1500)
  ledger({ ok: false, claudeChars: task.length, files: 0 })
  die(run.status || 1, `Codex failed (exit ${run.status ?? 'none'}). ${why}${mode === 'implement' ? '\nIt may have edited files before failing: review the project before retrying.' : ''}`)
}

// ---- diff (implement) ---------------------------------------------------------
let report = ''
let changedCount = 0
if (before) {
  const after = snapshot()
  const changed = []
  for (const [path, a] of after) {
    const b = before.get(path)
    if (!b) changed.push({ path, kind: 'added', old: null, now: a })
    else if (a.size !== b.size || a.mtime !== b.mtime) {
      if (a.text !== null && b.text !== null && a.text === b.text) continue
      changed.push({ path, kind: 'modified', old: b, now: a })
    }
  }
  for (const [path, b] of before) if (!after.has(path)) changed.push({ path, kind: 'deleted', old: b, now: null })
  changedCount = changed.length

  let diff = ''
  const textual = changed.filter(c => (c.old === null || c.old.text !== null) && (c.now === null || c.now.text !== null))
  const opaque = changed.filter(c => !textual.includes(c))
  if (textual.length > 0) {
    const tmp = mkdtempSync(join(tmpdir(), 'delegate-'))
    try {
      for (const c of textual) {
        for (const [side, v] of [['old', c.old], ['new', c.now]]) {
          if (v === null) continue
          const p = join(tmp, side, c.path)
          mkdirSync(dirname(p), { recursive: true })
          writeFileSync(p, v.text)
        }
      }
      for (const side of ['old', 'new']) mkdirSync(join(tmp, side), { recursive: true })
      const g = spawnSync('git', ['diff', '--no-index', '--no-color', '--stat=120', '-U2', '--patch', 'old', 'new'], { cwd: tmp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      const swaps = [['{old => new}/', ''], ['/dev/null => new/', '(new) '], ['a/old/', 'a/'], ['b/new/', 'b/'], ['a/new/', 'a/'], ['b/old/', 'b/']]
      diff = swaps.reduce((s, [from, to]) => s.split(from).join(to), g.stdout ?? '').replace(/(^ )old\/(\S+) => \/dev\/null/gm, '$1(deleted) $2')
      if (g.error) diff = `(git not found: no line diff) changed files:\n${textual.map(c => `${c.kind} ${c.path}`).join('\n')}`
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  const full = join(RUNS, `${stamp}.implement.diff`)
  writeFileSync(full, diff)
  const opaqueList = opaque.length ? `\nBinary/large files ${opaque.map(c => `${c.kind} ${c.path}`).join(', ')}` : ''
  report = changed.length === 0
    ? '\n\n## Diff\nNo files changed.'
    : `\n\n## Diff (${changed.length} file${changed.length === 1 ? '' : 's'})${opaqueList}\n` +
      (diff.length <= MAX_DIFF ? diff : `${diff.slice(0, MAX_DIFF)}\n[diff cut at ${MAX_DIFF} of ${diff.length} chars; full diff: ${full}]`)
}

const shown = answer.length <= MAX_ANSWER ? answer : `${answer.slice(0, MAX_ANSWER)}\n[answer cut at ${MAX_ANSWER} of ${answer.length} chars; full: ${out}]`
const header = `[Codex ${mode} · ${model ?? 'default model'} · ${effort} · ${Math.round(ms / 1000)}s · ${Math.round((usage.input + usage.output) / 1000)}k tokens · ${limitNote}]\n`
const printed = header + shown + report
ledger({ ok: true, claudeChars: task.length + printed.length, files: changedCount })
console.log(printed)
