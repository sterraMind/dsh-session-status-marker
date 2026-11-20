/** @module Pure inference rules used by the host service.
 *
 * Zero DSH imports so these functions can be unit-tested without booting a
 * session log. Each rule maps a canonical session-event observation to an
 * inferred {@link InferenceResult}, following the taxonomy documented in
 * `docs/research/04-session-state-taxonomy.md`.
 */

import type { AutoReasonCode, MarkRecord, StatusEnum } from './types.js'

/** Normalized view of one session event for the inference engine. */
export interface InferenceObservation {
  type: string
  seq: number
  time: number
  data: unknown
}

/** A proposed automatic mark, produced but not yet persisted. */
export interface InferenceResult {
  status: StatusEnum
  autoReason: AutoReasonCode
  subjectId: string | null
  note: string | null
}

/** Safely read one string property off an unknown object. */
function stringField(obj: unknown, key: string): string | undefined {
  if (typeof obj !== 'object' || obj === null || !(key in obj)) return undefined
  const v: unknown = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}

/** Read one typed sub-field and cast down for switch access. */
function field(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null || !(key in obj)) return undefined
  return (obj as Record<string, unknown>)[key]
}

/**
 * Read a tool call's arguments. `tool/call.arguments` persists the raw JSON
 * string exactly as the model produced it (`packages/core/session` types), so
 * a parsed lookup would silently never match; parse here and treat malformed
 * JSON as "no arguments".
 */
function toolArguments(data: unknown): unknown {
  const raw = field(data, 'arguments')
  if (typeof raw !== 'string' || raw.length === 0) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/** Extract the discriminant `kind` of a TurnEndReasonMap payload. */
function turnEndKind(data: unknown): string | undefined {
  const reason = field(data, 'reason')
  return stringField(reason, 'kind')
}

/**
 * Decide whether `observation` implies an auto mark. Unknown event types take
 * the merge-extensible documented default of "no inference".
 * @returns a non-null result when a rule fires; `null` otherwise.
 */
export function inferStatus(observation: InferenceObservation): InferenceResult | null {
  switch (observation.type) {
    case 'turn/end': {
      const kind = turnEndKind(observation.data)
      if (kind === 'interrupted') return { status: 'stopped', autoReason: 'turn-interrupted', subjectId: null, note: 'Turn was interrupted before completion.' }
      if (kind === 'blocked') return { status: 'blocked', autoReason: 'turn-blocked', subjectId: null, note: null }
      if (kind === 'aborted' || kind === 'error') return { status: 'stopped', autoReason: 'turn-interrupted', subjectId: null, note: null }
      return null
    }
    case 'tool/call': {
      const name = stringField(observation.data, 'name')
      if (name !== 'TodoWrite' && name !== 'todo_write') return null
      const todos = field(toolArguments(observation.data), 'todos')
      if (!Array.isArray(todos)) return null
      const hasPending = todos.some((t: unknown) => {
        const s = stringField(t, 'status')
        return s !== undefined && s !== 'completed'
      })
      if (!hasPending) return null
      return { status: 'todo', autoReason: 'tool-write-todo', subjectId: stringField(observation.data, 'callId') ?? null, note: null }
    }
    case 'job/settled': {
      // `JobSettledData extends JobRegisteredData`, whose identifier field is
      // `jobId` — reading `id` would silently never match a real event.
      const status = stringField(observation.data, 'status')
      if (status !== 'failed' && status !== 'killed') return null
      return { status: 'stopped', autoReason: 'job-failed', subjectId: stringField(observation.data, 'jobId') ?? null, note: null }
    }
    case 'goal/change': {
      // The phase lives on the nested snapshot (`GoalSnapshotChangeMeta.goal`),
      // and only a `block` operation reports a blocked goal.
      if (stringField(observation.data, 'operation') !== 'block') return null
      const phase = stringField(field(observation.data, 'goal'), 'phase')
      if (phase !== 'blocked') return null
      return { status: 'blocked', autoReason: 'goal-blocked', subjectId: null, note: null }
    }
    default:
      return null
  }
}

/** Whether an inferred mark may overwrite an existing stored row.
 *
 * Explicit intent (the user clicked, or the model called `set_session_status`)
 * is never replaced by inference; only another explicit write can change it.
 */
export function shouldApplyInference(current: MarkRecord | null, proposed: InferenceResult): boolean {
  if (current === null) return true
  if (current.source !== 'auto') return false
  return current.status !== proposed.status || current.autoReason !== proposed.autoReason
}

/** Whether an auto mark has expired according to the deployed retention window. */
export function isAutoMarkExpired(mark: MarkRecord, now: number, autoExpireMs: number): boolean {
  if (autoExpireMs <= 0 || mark.source !== 'auto') return false
  return now - mark.insertedAtMs > autoExpireMs
}
