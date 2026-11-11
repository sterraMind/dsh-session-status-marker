/** @module Shared constants between Host and Browser halves — no runtime deps.
 *
 * This module is deliberately zero-import: the Browser bundle may only call
 * `require()` for specifiers present in the frozen shell module table
 * (`.research/dsh-repo/packages/client/web/src/platform.ts`). Keeping contracts
 * here means the bundle does not pull in `zod` or any host-only package.
 */

/** Current storage-domain format version. Bump with `compatibleVersions` when the row shape changes. */
export const MARK_VERSION = 1 as const

/** All user-selectable statuses. `done` is terminal-success; `stopped` is terminal-abnormal. */
export const STATUS_VALUES = [
  'todo', 'done', 'stopped', 'blocked',
  'review', 'pending-subagent', 'awaiting-answer', 'feedback',
] as const

/** Union of status labels. */
export type StatusEnum = (typeof STATUS_VALUES)[number]

/** Rule codes for auto-inferred marks. */
export const AUTO_REASON_VALUES = [
  'turn-interrupted',
  'turn-blocked',
  'tool-write-todo',
  'tool-result-progress',
  'job-failed',
  'goal-blocked',
  'session-stop-invoked',
] as const

/** Union of auto-inference rule codes. */
export type AutoReasonCode = (typeof AUTO_REASON_VALUES)[number]

/** Who set the mark. Manual marks always win over auto marks. */
export const MARK_SOURCES = ['manual', 'auto'] as const
export type MarkSource = (typeof MARK_SOURCES)[number]

/** Max characters accepted in a note when no boot-time `maxNoteLength` is set. */
export const DEFAULT_MAX_NOTE_LENGTH = 200

/** Browser re-read cadence used until the Host reports its configured value. */
export const DEFAULT_REFRESH_INTERVAL_MS = 2000

/** One durable row. Mirrored by `MarkRecordSchema` in `./types.ts`. */
export interface MarkRecord {
  readonly version: typeof MARK_VERSION
  readonly insertedAtMs: number
  readonly seq: number
  readonly sessionId: string
  readonly status: StatusEnum
  readonly source: MarkSource
  readonly subjectId: string | null
  readonly autoReason: AutoReasonCode | null
  readonly note: string | null
}

/** Request body for the set action of the POST exact route and the `set_session_status` tool. */
export interface SetMarkBody {
  readonly action: 'set'
  readonly sessionId: string
  readonly status: StatusEnum
  readonly source: 'manual'
  readonly note: string | null
  readonly subjectId: string | null
}

/** Request body for the clear action of the POST exact route. */
export interface ClearMarkBody {
  readonly action: 'clear'
  readonly sessionId: string
}

/** Response returned by `GET /api/session-status-marker.state`. */
export interface MarkSnapshot {
  readonly sessionId: string
  readonly mark: MarkRecord | null
}

/** Response returned by `GET /api/session-status-marker.list`. */
export interface AllMarksResponse {
  readonly marks: readonly MarkRecord[]
  /** How often the Browser should re-read this route, from the Host config. */
  readonly refreshIntervalMs: number
}

/** Success response for mutation routes. */
export interface MutationOk {
  readonly ok: true
  readonly sessionId: string
  readonly mark: MarkRecord | null
  readonly deleted?: boolean
}

/** Failure response for mutation routes; `code` is a stable machine-readable token. */
export interface MutationError {
  readonly ok: false
  readonly code: 'invalid-json' | 'invalid-body' | 'unsupported-action'
  readonly message: string
}

/**
 * Glyph ids drawn from the official DSH icon set (`ICON_ARTWORK` keys).
 *
 * The union is the contract between {@link StatusMeta.icon} and the Browser
 * bundle's `ICONS` table: a status naming a glyph the table does not carry is a
 * compile error rather than a badge that silently renders nothing.
 */
export type MarkIconKey =
  | 'checklist-outline'
  | 'check-circle-fill'
  | 'stop-fill'
  | 'warning-triangle-outline'
  | 'browse-outline'
  | 'agent-preset-outline'
  | 'pause-outline'
  | 'like-outline'

/** Human-facing metadata for each status, used by the Browser badge + hover card. */
export interface StatusMeta {
  /** Glyph id from the official DSH icon set (`ICON_ARTWORK` keys). */
  readonly icon: MarkIconKey
  /** Theme token carrying the status color (`--dsw-alias-state-*-primary`). */
  readonly tone: string
  /** Localization key for the status label (see `./client/locales.ts`). */
  readonly labelKey: StatusLabelKey
}

/** Template-literal key union for status labels; assignable to the locale key union. */
export type StatusLabelKey = `status.${StatusEnum}`

/** Per-status presentation metadata, shared by the Browser UI. */
export const STATUS_META: Readonly<Record<StatusEnum, StatusMeta>> = {
  todo: { icon: 'checklist-outline', tone: 'var(--dsw-alias-state-business-primary)', labelKey: 'status.todo' },
  done: { icon: 'check-circle-fill', tone: 'var(--dsw-alias-state-done-primary)', labelKey: 'status.done' },
  stopped: { icon: 'stop-fill', tone: 'var(--dsw-alias-state-error-primary)', labelKey: 'status.stopped' },
  blocked: { icon: 'warning-triangle-outline', tone: 'var(--dsw-alias-state-warn-primary)', labelKey: 'status.blocked' },
  review: { icon: 'browse-outline', tone: 'var(--dsw-alias-state-business-primary)', labelKey: 'status.review' },
  'pending-subagent': { icon: 'agent-preset-outline', tone: 'var(--dsw-alias-state-success-primary)', labelKey: 'status.pending-subagent' },
  'awaiting-answer': { icon: 'pause-outline', tone: 'var(--dsw-alias-state-idle-primary)', labelKey: 'status.awaiting-answer' },
  feedback: { icon: 'like-outline', tone: 'var(--dsw-alias-state-success-primary)', labelKey: 'status.feedback' },
}

/** Exact-route absolute paths (Host registration). */
export const MARKER_STATE_PATH = '/api/session-status-marker.state'
export const MARKER_LIST_PATH = '/api/session-status-marker.list'
export const MARKER_MUTATE_PATH = '/api/session-status-marker.mutate'

/** Exact-route document-relative paths (Browser `fetch`). */
export const MARKER_STATE_ROUTE = MARKER_STATE_PATH.slice(1)
export const MARKER_LIST_ROUTE = MARKER_LIST_PATH.slice(1)
export const MARKER_MUTATE_ROUTE = MARKER_MUTATE_PATH.slice(1)
