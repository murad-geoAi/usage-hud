import { expect, test } from 'claude-code/testing'
import { parseTasks } from './spec'

test('parseTasks counts done, blocked and the next task', () => {
  const s = parseTasks('# T\n- [x] T1 [S] a\n- [ ] T2 [M] b BLOCKED: err\n- [ ] T3 [L] c\n  - Done when: x\n- [ ] T4 [S] d\n')
  expect(s).toEqual({ done: 1, total: 4, blocked: 1, next: 'T3 c' })
})

test('parseTasks takes indented and uppercase checkboxes, CRLF', () => {
  const s = parseTasks('  - [X] T1 [S] a\r\n* [ ] T2 [S] b\r\n')
  expect(s).toEqual({ done: 1, total: 2, blocked: 0, next: 'T2 b' })
})

test('parseTasks: empty file is 0/0 and all done has no next', () => {
  expect(parseTasks('')).toEqual({ done: 0, total: 0, blocked: 0, next: null })
  expect(parseTasks('- [x] T1 [S] a\n').next).toBeNull()
})
