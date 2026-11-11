/** Unit tests for the pure inference engine. No DSH runtime required. */

import { describe, it, expect } from './vitest-shim.mjs'
import {
  inferStatus,
  shouldApplyInference,
  isAutoMarkExpired,
} from '../lib/inference.js'

const NOW = 1_000_000

function mark(partial) {
  return {
    version: 1,
    insertedAtMs: NOW,
    seq: 0,
    sessionId: 's1',
    status: 'todo',
    source: 'auto',
    subjectId: null,
    autoReason: 'turn-interrupted',
    note: null,
    ...partial,
  }
}

describe('inferStatus', () => {
  it('maps turn/end interrupted → stopped/turn-interrupted with a note', () => {
    const r = inferStatus({ type: 'turn/end', seq: 3, time: NOW, data: { reason: { kind: 'interrupted' } } })
    expect(r).toEqual({ status: 'stopped', autoReason: 'turn-interrupted', subjectId: null, note: 'Turn was interrupted before completion.' })
  })

  it('maps turn/end blocked → blocked/turn-blocked', () => {
    const r = inferStatus({ type: 'turn/end', seq: 3, time: NOW, data: { reason: { kind: 'blocked' } } })
    expect(r).toMatchObject({ status: 'blocked', autoReason: 'turn-blocked' })
  })

  it('maps turn/end aborted/error → stopped/turn-interrupted', () => {
    for (const kind of ['aborted', 'error']) {
      const r = inferStatus({ type: 'turn/end', seq: 3, time: NOW, data: { reason: { kind } } })
      expect(r).toMatchObject({ status: 'stopped', autoReason: 'turn-interrupted' })
    }
  })

  it('returns null for a completed turn (no inference)', () => {
    const r = inferStatus({ type: 'turn/end', seq: 3, time: NOW, data: { reason: { kind: 'completed' } } })
    expect(r).toBeNull()
  })

  it('maps TodoWrite with pending todos → todo/tool-write-todo, capturing callId', () => {
    const r = inferStatus({
      type: 'tool/call',
      seq: 5,
      time: NOW,
      data: {
        name: 'TodoWrite',
        callId: 'c9',
        arguments: JSON.stringify({ todos: [{ status: 'in_progress' }, { status: 'completed' }] }),
      },
    })
    expect(r).toMatchObject({ status: 'todo', autoReason: 'tool-write-todo', subjectId: 'c9' })
  })

  it('ignores TodoWrite with only completed todos', () => {
    const r = inferStatus({
      type: 'tool/call',
      seq: 5,
      time: NOW,
      data: { name: 'todo_write', arguments: JSON.stringify({ todos: [{ status: 'completed' }] }) },
    })
    expect(r).toBeNull()
  })

  it('ignores malformed tool-call arguments instead of throwing', () => {
    const r = inferStatus({
      type: 'tool/call',
      seq: 5,
      time: NOW,
      data: { name: 'todo_write', callId: 'c1', arguments: '{not json' },
    })
    expect(r).toBeNull()
  })

  it('maps job/settled failed/killed → stopped/job-failed', () => {
    const r = inferStatus({ type: 'job/settled', seq: 7, time: NOW, data: { id: 'j2', status: 'failed' } })
    expect(r).toMatchObject({ status: 'stopped', autoReason: 'job-failed', subjectId: 'j2' })
  })

  it('maps goal/change blocked → blocked/goal-blocked', () => {
    const r = inferStatus({ type: 'goal/change', seq: 9, time: NOW, data: { phase: 'blocked' } })
    expect(r).toMatchObject({ status: 'blocked', autoReason: 'goal-blocked' })
  })

  it('does not infer from user/message (real payload is a UserMessage, not text)', () => {
    const r = inferStatus({
      type: 'user/message',
      seq: 11,
      time: NOW,
      data: { role: 'user', id: 'm1', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } },
    })
    expect(r).toBeNull()
  })

  it('returns null for unknown event types (merge-extensible default)', () => {
    expect(inferStatus({ type: 'nope/event', seq: 1, time: NOW, data: {} })).toBeNull()
  })
})

describe('shouldApplyInference', () => {
  const proposed = { status: 'stopped', autoReason: 'turn-interrupted', subjectId: null, note: null }

  it('applies when no current mark exists', () => {
    expect(shouldApplyInference(null, proposed)).toBe(true)
  })

  it('never overwrites a manual mark', () => {
    expect(shouldApplyInference(mark({ source: 'manual' }), proposed)).toBe(false)
  })

  it('re-applies only when status/autoReason change', () => {
    expect(shouldApplyInference(mark({ status: 'stopped', autoReason: 'turn-interrupted' }), proposed)).toBe(false)
    expect(shouldApplyInference(mark({ status: 'blocked', autoReason: 'turn-blocked' }), proposed)).toBe(true)
  })
})

describe('isAutoMarkExpired', () => {
  it('never expires manual marks', () => {
    const m = mark({ source: 'manual', insertedAtMs: NOW - 9_999_999 })
    expect(isAutoMarkExpired(m, NOW, 1000)).toBe(false)
  })

  it('respects autoExpireMs = 0 (disabled)', () => {
    const m = mark({ insertedAtMs: NOW - 9_999_999 })
    expect(isAutoMarkExpired(m, NOW, 0)).toBe(false)
  })

  it('expires an auto mark past the window', () => {
    const m = mark({ insertedAtMs: NOW - 5000 })
    expect(isAutoMarkExpired(m, NOW, 1000)).toBe(true)
    expect(isAutoMarkExpired(m, NOW, 10_000)).toBe(false)
  })
})
