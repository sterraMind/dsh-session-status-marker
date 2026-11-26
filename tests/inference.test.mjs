/** Unit tests for the pure inference engine. No DSH runtime required. */

import { describe, it, expect } from './vitest-shim.mjs'
import {
  inferStatus,
  inferFallback,
  shouldApplyInference,
  shouldApplyFallback,
  isAutoMarkExpired,
  observationOf,
  resolveAutoFromObservation,
  shouldRecordObservation,
} from '../lib/inference.js'
import { isObservationStale, isObservationOutdated } from '../lib/contracts.js'

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
    observedStatus: null,
    observedEvent: null,
    observedAtMs: null,
    ...partial,
  }
}

describe('inferStatus', () => {
  it('ignores turn/end interrupted (synthesized only at crash recovery, never by a live loop)', () => {
    const r = inferStatus({ type: 'turn/end', seq: 3, time: NOW, data: { reason: { kind: 'interrupted' } } })
    expect(r).toBeNull()
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
    const r = inferStatus({
      type: 'job/settled',
      seq: 7,
      time: NOW,
      data: { jobId: 'j2', owner: 'session', kind: 'bash', label: 'pnpm test', startedAt: 1, finishedAt: 2, status: 'failed', cause: 'producer', producerReported: true },
    })
    expect(r).toMatchObject({ status: 'stopped', autoReason: 'job-failed', subjectId: 'j2' })
  })

  it('reads job/settled subject from jobId, not from a stale id field', () => {
    const r = inferStatus({ type: 'job/settled', seq: 7, time: NOW, data: { id: 'j2', status: 'failed' } })
    expect(r).toMatchObject({ status: 'stopped', autoReason: 'job-failed', subjectId: null })
  })

  it('maps goal/change blocked → blocked/goal-blocked', () => {
    const r = inferStatus({
      type: 'goal/change',
      seq: 9,
      time: NOW,
      data: { kind: 'goal/change', version: 1, operation: 'block', goal: { id: 'g1', phase: 'blocked' }, roundsStarted: 2, createdAt: 1, updatedAt: 2 },
    })
    expect(r).toMatchObject({ status: 'blocked', autoReason: 'goal-blocked' })
  })

  it('ignores goal/change whose phase is not nested under goal', () => {
    const r = inferStatus({ type: 'goal/change', seq: 9, time: NOW, data: { phase: 'blocked' } })
    expect(r).toBeNull()
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

describe('inferFallback', () => {
  it('maps turn/start to todo/fallback-running when no subagents', () => {
    const r = inferFallback({ type: 'turn/start', data: { turn: 1 }, subagentsRunning: 0 })
    expect(r).toEqual({ status: 'todo', autoReason: 'fallback-running', note: null })
  })

  it('maps a normally-completed turn to feedback/fallback-feedback when no subagents run', () => {
    const r = inferFallback({ type: 'turn/end', data: { reason: { kind: 'completed' } }, subagentsRunning: 0 })
    expect(r).toEqual({ status: 'feedback', autoReason: 'fallback-feedback', note: null })
  })

  it('maps a completed turn to pending-subagent when subagents are still running', () => {
    const r = inferFallback({ type: 'turn/end', data: { reason: { kind: 'completed' } }, subagentsRunning: 3 })
    expect(r).toEqual({ status: 'pending-subagent', autoReason: 'fallback-subagent', note: null })
  })

  it('ignores turn/end kinds already handled by the inference layer (blocked/error)', () => {
    for (const kind of ['blocked', 'aborted', 'error']) {
      const r = inferFallback({ type: 'turn/end', data: { reason: { kind } }, subagentsRunning: 0 })
      expect(r).toBeNull()
    }
  })

  it('excludes the two crash-recovery synthetic kinds (interrupted/forked)', () => {
    for (const kind of ['interrupted', 'forked']) {
      const r = inferFallback({ type: 'turn/end', data: { reason: { kind } }, subagentsRunning: 0 })
      expect(r).toBeNull()
    }
  })

  it('returns null for unknown event types (merge-extensible default)', () => {
    expect(inferFallback({ type: 'nope/event', data: {}, subagentsRunning: 0 })).toBeNull()
  })
})

describe('shouldApplyFallback', () => {
  const terminal = { status: 'feedback', autoReason: 'fallback-feedback', note: null }

  it('fires when the session has no mark at all', () => {
    expect(shouldApplyFallback(null, terminal)).toBe(true)
  })

  it('never touches an explicit manual or agent mark', () => {
    expect(shouldApplyFallback(mark({ source: 'manual' }), terminal)).toBe(false)
    expect(shouldApplyFallback(mark({ source: 'agent' }), terminal)).toBe(false)
  })

  it('never touches a mark produced by the inference layer', () => {
    const inferred = mark({ source: 'auto', autoReason: 'turn-interrupted', status: 'stopped' })
    expect(shouldApplyFallback(inferred, terminal)).toBe(false)
  })

  it('lets a terminal fallback upgrade its own transient running mark', () => {
    const running = mark({ source: 'auto', autoReason: 'fallback-running', status: 'todo' })
    expect(shouldApplyFallback(running, terminal)).toBe(true)
  })

  it('is idempotent against an identical fallback mark', () => {
    const existing = mark({ source: 'auto', autoReason: 'fallback-feedback', status: 'feedback' })
    expect(shouldApplyFallback(existing, terminal)).toBe(false)
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

describe('observationOf', () => {
  it('maps turn/start to a running observation', () => {
    expect(observationOf({ type: 'turn/start', seq: 1, time: NOW, data: {} })).toEqual({
      status: 'todo',
      event: 'turn/start',
      atMs: NOW,
    })
  })

  it('maps turn/end kinds to the state the log showed', () => {
    const turnEnd = (kind) => observationOf({ type: 'turn/end', seq: 1, time: NOW, data: { reason: { kind } } })
    expect(turnEnd('blocked')).toEqual({ status: 'blocked', event: 'turn/end', atMs: NOW })
    expect(turnEnd('aborted')).toEqual({ status: 'stopped', event: 'turn/end', atMs: NOW })
    expect(turnEnd('error')).toEqual({ status: 'stopped', event: 'turn/end', atMs: NOW })
    expect(turnEnd('completed')).toEqual({ status: 'feedback', event: 'turn/end', atMs: NOW })
  })

  it('observes nothing for the crash-recovery synthetic kinds', () => {
    for (const kind of ['interrupted', 'forked']) {
      expect(observationOf({ type: 'turn/end', seq: 1, time: NOW, data: { reason: { kind } } })).toBe(null)
    }
  })

  it('maps job/settled failed/killed and ignores other outcomes', () => {
    const settled = (status) => observationOf({ type: 'job/settled', seq: 1, time: NOW, data: { jobId: 'j1', status } })
    expect(settled('failed')).toEqual({ status: 'stopped', event: 'job/settled', atMs: NOW })
    expect(settled('killed')).toEqual({ status: 'stopped', event: 'job/settled', atMs: NOW })
    expect(settled('completed')).toBe(null)
  })

  it('maps a blocked goal/change and ignores the others', () => {
    expect(observationOf({ type: 'goal/change', seq: 1, time: NOW, data: { operation: 'block', goal: { phase: 'blocked' } } })).toEqual({
      status: 'blocked',
      event: 'goal/change',
      atMs: NOW,
    })
    expect(observationOf({ type: 'goal/change', seq: 1, time: NOW, data: { operation: 'edit', goal: { phase: 'blocked' } } })).toBe(null)
  })

  it('never observes subagent events (they only maintain the running counter)', () => {
    for (const type of ['subagent/start', 'subagent/end']) {
      expect(observationOf({ type, seq: 1, time: NOW, data: {} })).toBe(null)
    }
  })

  it('returns null for unknown event types', () => {
    expect(observationOf({ type: 'user/message', seq: 1, time: NOW, data: {} })).toBe(null)
  })
})

describe('isObservationStale', () => {
  it('treats a missing observation as never stale', () => {
    expect(isObservationStale(null, NOW, 1000)).toBe(false)
  })

  it('respects ttlMs = 0 (disabled)', () => {
    expect(isObservationStale(NOW - 9_999_999, NOW, 0)).toBe(false)
  })

  it('is fresh up to and including the ttl, stale past it', () => {
    expect(isObservationStale(NOW - 1000, NOW, 1000)).toBe(false)
    expect(isObservationStale(NOW - 1001, NOW, 1000)).toBe(true)
  })
})

describe('isObservationOutdated', () => {
  it('never demotes a running observation, however old', () => {
    // `turn/start` is the only producer of `todo`, and nothing contradicts it
    // until the turn ends: its age says nothing about whether it still holds.
    expect(isObservationOutdated('todo', NOW - 9_999_999, NOW, 1000)).toBe(false)
  })

  it('demotes an old terminal observation', () => {
    expect(isObservationOutdated('stopped', NOW - 9_999_999, NOW, 1000)).toBe(true)
  })

  it('keeps a fresh terminal observation and honours ttlMs = 0', () => {
    expect(isObservationOutdated('done', NOW - 500, NOW, 1000)).toBe(false)
    expect(isObservationOutdated('done', NOW - 9_999_999, NOW, 0)).toBe(false)
  })
})

describe('shouldRecordObservation', () => {
  const next = { status: 'todo', event: 'turn/start', atMs: NOW }

  it('records when the session has no mark yet', () => {
    expect(shouldRecordObservation(null, next)).toBe(true)
  })

  it('records onto an explicit mark without touching it (the two layers are independent)', () => {
    // This is the case `shouldApplyInference` refuses: an observation rides
    // beside a manual mark instead of being suppressed by it.
    const explicit = mark({ source: 'manual', status: 'done', autoReason: null })
    expect(shouldApplyInference(explicit, { status: 'todo', autoReason: 'tool-write-todo', subjectId: null, note: null })).toBe(false)
    expect(shouldRecordObservation(explicit, next)).toBe(true)
  })

  it('drops a repeat of the same observation', () => {
    const observed = mark({ observedStatus: 'todo', observedEvent: 'turn/start', observedAtMs: NOW - 10 })
    expect(shouldRecordObservation(observed, next)).toBe(false)
  })

  it('records when only the event changed', () => {
    const observed = mark({ observedStatus: 'todo', observedEvent: 'turn/start', observedAtMs: NOW - 10 })
    expect(shouldRecordObservation(observed, { ...next, event: 'turn/end' })).toBe(true)
  })
})

describe('resolveAutoFromObservation', () => {
  it('reports the newer observation when an auto row was left behind by an interrupted turn', () => {
    // The real row that started this: `turn/end aborted` wrote stopped at
    // 16:56, the user kept the session going, and `turn/start` was observed two
    // minutes later. The row never changed again, so the badge stayed red.
    const stale = mark({
      status: 'stopped',
      autoReason: 'turn-interrupted',
      insertedAtMs: NOW - 120_000,
      observedStatus: 'todo',
      observedEvent: 'turn/start',
      observedAtMs: NOW,
    })
    const resolved = resolveAutoFromObservation(stale)
    expect(resolved).toMatchObject({
      status: 'todo',
      autoReason: 'fallback-running',
      insertedAtMs: NOW,
      observedStatus: null,
      observedEvent: null,
      observedAtMs: null,
    })
  })

  it('maps every observed status to a code the automatic layers already write', () => {
    const cases = {
      todo: 'fallback-running',
      feedback: 'fallback-feedback',
      'pending-subagent': 'fallback-subagent',
      stopped: 'turn-interrupted',
      blocked: 'turn-blocked',
      'awaiting-answer': 'turn-completed',
    }
    for (const [status, autoReason] of Object.entries(cases)) {
      const resolved = resolveAutoFromObservation(
        mark({ status: 'stopped', insertedAtMs: NOW - 1, observedStatus: status, observedAtMs: NOW }),
      )
      expect(resolved.status).toBe(status)
      expect(resolved.autoReason).toBe(autoReason)
    }
  })

  it('never touches an explicit mark, whatever the observation says', () => {
    for (const source of ['manual', 'agent']) {
      const explicit = mark({
        source,
        status: 'done',
        autoReason: null,
        insertedAtMs: NOW - 120_000,
        observedStatus: 'todo',
        observedEvent: 'turn/start',
        observedAtMs: NOW,
      })
      expect(resolveAutoFromObservation(explicit)).toBe(explicit)
    }
  })

  it('leaves a row alone when the observation is not newer, or agrees with it', () => {
    const older = mark({ status: 'stopped', insertedAtMs: NOW, observedStatus: 'todo', observedAtMs: NOW - 1 })
    expect(resolveAutoFromObservation(older)).toBe(older)
    const same = mark({ status: 'stopped', insertedAtMs: NOW - 1, observedStatus: 'stopped', observedAtMs: NOW })
    expect(resolveAutoFromObservation(same)).toBe(same)
    const bare = mark({ status: 'stopped', insertedAtMs: NOW - 1 })
    expect(resolveAutoFromObservation(bare)).toBe(bare)
  })

  it('leaves a pending-subagent row alone when the same event stamped both layers', () => {
    // `turn/end completed` writes the fallback pending-subagent row and records
    // the feedback observation with the same `event.time`; an equal stamp is
    // not a correction, so the badge must stay on pending-subagent.
    const stored = mark({
      status: 'pending-subagent',
      autoReason: 'fallback-subagent',
      insertedAtMs: 1000,
      observedStatus: 'feedback',
      observedEvent: 'turn/end',
      observedAtMs: 1000,
    })
    const resolved = resolveAutoFromObservation(stored)
    expect(resolved).toBe(stored)
    expect(resolved.status).toBe('pending-subagent')
    expect(resolved.observedStatus).toBe('feedback')
  })

  it('leaves an awaiting-answer row alone when the same event stamped both layers', () => {
    const stored = mark({
      status: 'awaiting-answer',
      autoReason: 'turn-completed',
      insertedAtMs: 1000,
      observedStatus: 'feedback',
      observedEvent: 'turn/end',
      observedAtMs: 1000,
    })
    const resolved = resolveAutoFromObservation(stored)
    expect(resolved).toBe(stored)
    expect(resolved.status).toBe('awaiting-answer')
  })
})
