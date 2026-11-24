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
  /**
   * Deployment switch for the turn-completed fallback mark. When `true`, a
   * `turn/end` with `reason.kind === 'completed'` maps to `awaiting-answer`
   * as a last-resort catch-all. The Host only reaches the completed branch
   * when no earlier inference rule fired on this event, and `#observe`
   * additionally refuses to write the row when a mark already exists, so
   * explicit (manual / agent) marks are never overwritten. Defaults to
   * `false` so existing installs keep their current behaviour.
   */
  turnEndAwaitingAnswer?: boolean
}

/** A proposed automatic mark, produced but not yet persisted. */
export interface InferenceResult {
  status: StatusEnum
  autoReason: AutoReasonCode
  subjectId: string | null
  note: string | null
}

/** A proposed fallback mark, produced but not yet persisted. */
export interface FallbackResult {
  status: StatusEnum
  autoReason: AutoReasonCode
  note: string | null
}

/** Normalized view of one session event for the fallback net (separate layer). */
export interface FallbackObservation {
  type: string
  data: unknown
  /**
   * How many subagents the process currently believes are running. This is
   * realtime-only state maintained in the Host service from the cordis
   * `subagent/start` / `subagent/end` events, which do not persist: after a
   * restart the count resets to `0` and the pending-subagent fallback can no
   * longer fire for a past turn.
   */
  subagentsRunning: number
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
      // Fallback mark for a normal turn end. The Host gates this branch behind
      // the `turnEndAwaitingAnswer` config flag, so existing installs keep
      // their current behaviour. The Host also only reaches here when no
      // earlier inference rule fired on this event — the completed branch is
      // the last one checked.
      if (kind === 'completed') {
        if (!observation.turnEndAwaitingAnswer) return null
        return { status: 'awaiting-answer', autoReason: 'turn-completed', subjectId: null, note: null }
      }
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

/**
 * The fallback net: a last-resort catch-all that fires only when a session has
 * no mark at all.
 *
 * This is a separate layer from {@link inferStatus} and must stay separate. The
 * event-driven rules above map a specific event to a state; the fallback fires
 * on the *absence* of a mark, which no single event encodes. The two layers
 * also differ in what they may touch: the fallback never overwrites a manual,
 * agent, or inference-produced mark — the Host gates every fallback write on
 * `currentMark === null`.
 *
 * Realtime-only limits, documented here because they bound what the fallback
 * can promise:
 *
 * - `turn/start` → `todo` is a *transient* running state. It does not persist
 *   across a restart, and a later `turn/end` terminal fallback is allowed to
 *   replace it (the Host permits a terminal fallback to supersede a
 *   `fallback-running` mark).
 * - `pending-subagent` depends on the process-local subagent running count,
 *   which the cordis `subagent/start` / `subagent/end` events maintain in
 *   memory only. After a restart the count is `0`, so the pending-subagent
 *   fallback can no longer fire for a turn that ended before the restart.
 *
 * `interrupted` and `forked` are excluded on purpose: upstream synthesizes both
 * at crash recovery (`packages/core/session`, `docs/subsystems/persistence.md`)
 * and no live loop emits them, so treating them as a fallback trigger would
 * mislabel a recovered session as a real terminal state.
 */
export function inferFallback(observation: FallbackObservation): FallbackResult | null {
  switch (observation.type) {
    case 'turn/start': {
      // A turn just opened: the session is running. This is transient and only
      // lands when the session has no mark yet.
      return { status: 'todo', autoReason: 'fallback-running', note: null }
    }
    case 'turn/end': {
      const kind = turnEndKind(observation.data)
      // Exclude the two synthesized reasons outright — they never come from a
      // live turn, so they carry no fallback signal.
      if (kind === 'interrupted' || kind === 'forked') return null
      // Only a normally-completed turn can be a "no result yet" net. The
      // `blocked` / `aborted` / `error` kinds are already handled by the
      // event-driven inference layer; duplicating them here would just race.
      if (kind !== 'completed') return null
      // A main turn that closes while subagents are still running means the
      // session is not really waiting on the user — it is waiting on its own
      // children. That outranks the awaiting-answer net.
      if (observation.subagentsRunning > 0) {
        return { status: 'pending-subagent', autoReason: 'fallback-subagent', note: null }
      }
      return { status: 'awaiting-answer', autoReason: 'fallback-awaiting', note: null }
    }
    default:
      return null
  }
}

/**
 * Whether a fallback mark may replace the current stored mark.
 *
 * Unlike {@link shouldApplyInference}, the fallback net can *upgrade* its own
 * transient running mark (`fallback-running`) into a terminal one on the same
 * turn's `turn/end`, so a session does not get stuck on `todo` after its turn
 * closes. It owns only the `fallback-*` codes it writes; it never touches an
 * explicit (`manual` / `agent`) mark, a mark the inference layer produced
 * (`turn-interrupted`, `job-failed`, …), or an identical fallback row it
 * already wrote.
 */
export function shouldApplyFallback(current: MarkRecord | null, proposed: FallbackResult): boolean {
  if (current === null) return true
  if (current.source !== 'auto') return false
  // Only our own codes are in scope; the inference layer's codes are out.
  if (typeof current.autoReason !== 'string' || !current.autoReason.startsWith('fallback-')) return false
  // A transient running mark upgrades to the terminal state on turn end.
  if (current.autoReason === 'fallback-running') return true
  // Identical terminal row: leave it (idempotent). A different terminal
  // fallback state is a rare transition and is not forced.
  return current.status !== proposed.status || current.autoReason !== proposed.autoReason
}
