import { expect, test } from 'claude-code/testing'
import { codexArgs, contextRows, Events, fingerprint, handoff, loadDirect, runDirect, selectEngine } from './direct'

const fixture = () => {
  const store = new Map<string, unknown>()
  const messages: any[] = [{ role: 'user', content: 'Build a blue dashboard. Keep the export button.' }]
  const calls: any[] = []
  let cwd = 'D:/project'
  let fail = false
  const $: any = {
    store: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))) } },
    session: { id: async () => 'session-one', cwd: async () => cwd, messages: async () => messages,
      append: async ({ message }: any) => { messages.push({ role: 'user', content: message.content }); return {} } },
    env: { get: async () => undefined }, fs: { exists: async () => false },
    process: { spawn: async function* (call: any) {
      calls.push(call)
      yield { stream: 'stdout', text: JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }) + '\n' }
      if (fail) { yield { stream: 'stdout', text: '{"type":"turn.failed","error":{"message":"Usage limit reached"}}\n' }; return { code: 1 } }
      yield { stream: 'stdout', text: '{"type":"item.completed","item":{"type":"agent_message","text":"Updated dashboard; tests passed."}}\n{"type":"turn.completed"}\n' }
      return { code: 0 }
    } }
  }
  return { $, store, messages, calls, move: (v: string) => { cwd = v }, fail: () => { fail = true } }
}
const opts = { model: 'gpt-6-astra', effort: 'medium', readOnly: false }
const progress = async () => {}

test('direct handoff starts a saved thread and resumes it with only new context', async () => {
  const f = fixture()
  await selectEngine(f.$, 'codex')
  await runDirect(f.$, 'Finish the dashboard.', opts, progress)
  expect(f.calls[0].input).toContain('Keep the export button')
  expect(f.calls[0].argv.includes('--ephemeral')).toBe(false)
  expect(f.messages.at(-1).content[0].text).toContain('Updated dashboard')
  await runDirect(f.$, 'Make the heading smaller.', opts, progress)
  expect(f.calls[1].argv).toContain('resume')
  expect(f.calls[1].argv).toContain('thread-1')
  expect(f.calls[1].input.includes('Keep the export button')).toBe(false)
  expect(f.calls[1].input).toContain('Make the heading smaller')
})

test('switching back preserves Codex notes and sends intervening Claude work on return', async () => {
  const f = fixture()
  await selectEngine(f.$, 'codex')
  await runDirect(f.$, 'Continue.', opts, progress)
  await selectEngine(f.$, 'claude')
  expect((await loadDirect(f.$)).state.engine).toBe('claude')
  expect(f.messages.at(-1).content[0].text).toContain('Codex response')
  f.messages.push({ role: 'assistant', content: 'Claude added a mobile layout.' })
  await selectEngine(f.$, 'codex')
  await runDirect(f.$, 'Check mobile.', opts, progress)
  expect(f.calls[1].input).toContain('Claude added a mobile layout')
  expect(f.calls[1].argv).toContain('thread-1')
})

test('worker failures preserve request and thread without claiming completion or retrying', async () => {
  const f = fixture(); f.fail()
  let error = ''
  try { await runDirect(f.$, 'Fix the export.', opts, progress) } catch (e) { error = String(e) }
  expect(error).toContain('Usage limit reached')
  expect(f.calls.length).toBe(1)
  const { state } = await loadDirect(f.$)
  expect(state.threadId).toBe('thread-1')
  expect(state.pending?.prompt).toBe('Fix the export.')
  expect(f.messages.at(-1).content[0].text).toContain('Fix the export')
})

test('moving a Claude session to another project never reuses its worker', async () => {
  const f = fixture()
  await selectEngine(f.$, 'codex'); await runDirect(f.$, 'Continue.', opts, progress)
  f.move('D:/other-project')
  const { state } = await loadDirect(f.$)
  expect(state.threadId).toBe(null)
  expect(state.engine).toBe('claude')
})

test('context supports compaction, tools, and excludes hidden thinking and known secrets', () => {
  const rows = contextRows([{ role: 'assistant', content: [
    { type: 'thinking', thinking: 'PRIVATE REASONING' }, { type: 'text', text: 'Summary: keep exports.' },
    { type: 'tool_use', name: 'Read', input: { path: 'src/main.ts' } },
  ] }, { role: 'user', content: [{ type: 'tool_result', content: 'API_KEY=super-secret' }] }])
  const text = rows.join(' ')
  expect(text).toContain('src/main.ts')
  expect(text.includes('PRIVATE REASONING')).toBe(false)
  expect(text.includes('super-secret')).toBe(false)
  expect(handoff(rows, [fingerprint('old context')], true, 'Continue.')).toContain('Summary: keep exports')
})

test('JSONL parser handles split chunks, final lines and failed turns', () => {
  const parser = new Events()
  parser.feed('{"type":"thread.star')
  parser.feed('ted","thread_id":"thread-2"}\n{"type":"turn.completed"}', true)
  expect(parser.threadId).toBe('thread-2')
  expect(parser.completed).toBe(true)
  parser.feed('{"type":"turn.failed","error":{"message":"quota"}}', true)
  expect(parser.failure).toBe('quota')
})

test('Codex argv keeps model values separate and enforces project sandbox or Plan read-only', () => {
  const args = codexArgs({ ...opts, threadId: 'thread-1' })
  expect(args).toContain('workspace-write')
  expect(args).toContain('approval_policy="never"')
  expect(args.includes('--dangerously-bypass-approvals-and-sandbox')).toBe(false)
  expect(codexArgs({ ...opts, threadId: null, readOnly: true })).toContain('read-only')
})
