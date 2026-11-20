/** @module Host-side schemas and re-exports, layered on the zero-dependency contracts.
 *
 * `src/contracts.ts` holds the runtime-free constants and interfaces shared with
 * the Browser half. This file adds the `zod` validation boundary and re-exports
 * everything so Host code imports from one place.
 */

import { z } from 'zod'
import {
  MARK_VERSION,
  STATUS_VALUES,
  MARK_SOURCES,
  EXPLICIT_SOURCES,
  AUTO_REASON_VALUES,
  DEFAULT_MAX_NOTE_LENGTH,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_ROW_ACTION_ORDER,
  DEFAULT_MENU_ITEM_ORDER,
  CLIENT_CONFIG_GLOBAL,
  marksRevision,
  type MarkRecord,
  type SetMarkBody,
  type ClearMarkBody,
  type MarkSnapshot,
  type AllMarksResponse,
  type OverviewEntry,
  type StatusGroup,
  type OverviewResponse,
  type MutationOk,
  type MutationError,
  type StatusMeta,
  type StatusEnum,
  type AutoReasonCode,
  type MarkSource,
  type ExplicitSource,
  STATUS_META,
  MARKER_STATE_PATH,
  MARKER_LIST_PATH,
  MARKER_MUTATE_PATH,
  MARKER_OVERVIEW_PATH,
  MARKER_STATE_ROUTE,
  MARKER_LIST_ROUTE,
  MARKER_MUTATE_ROUTE,
  MARKER_OVERVIEW_ROUTE,
} from './contracts.js'

export {
  MARK_VERSION,
  STATUS_VALUES,
  type StatusEnum,
  AUTO_REASON_VALUES,
  type AutoReasonCode,
  MARK_SOURCES,
  type MarkSource,
  EXPLICIT_SOURCES,
  type ExplicitSource,
  DEFAULT_MAX_NOTE_LENGTH,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_ROW_ACTION_ORDER,
  DEFAULT_MENU_ITEM_ORDER,
  CLIENT_CONFIG_GLOBAL,
  marksRevision,
  type MarkRecord,
  type SetMarkBody,
  type ClearMarkBody,
  type MarkSnapshot,
  type AllMarksResponse,
  type OverviewEntry,
  type StatusGroup,
  type OverviewResponse,
  type MutationOk,
  type MutationError,
  STATUS_META,
  type StatusMeta,
  MARKER_STATE_PATH,
  MARKER_LIST_PATH,
  MARKER_MUTATE_PATH,
  MARKER_OVERVIEW_PATH,
  MARKER_STATE_ROUTE,
  MARKER_LIST_ROUTE,
  MARKER_MUTATE_ROUTE,
  MARKER_OVERVIEW_ROUTE,
}

/** Zod schema for one durable row. This is the single runtime validation boundary. */
export const MarkRecordSchema = z.object({
  version: z.literal(MARK_VERSION),
  insertedAtMs: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  status: z.enum(STATUS_VALUES),
  source: z.enum(MARK_SOURCES),
  subjectId: z.string().min(1).nullable(),
  autoReason: z.enum(AUTO_REASON_VALUES).nullable(),
  note: z.string().max(DEFAULT_MAX_NOTE_LENGTH).nullable(),
}).strict()

/** Compile-time check that the schema's inferred row matches the shared contract. */
type _MarkRecordMatches = z.output<typeof MarkRecordSchema> extends MarkRecord
  ? MarkRecord extends z.output<typeof MarkRecordSchema> ? true : never
  : never
const _markRecordCheck: _MarkRecordMatches = true
void _markRecordCheck

/** Zod schema for the list response, including the conditional-read fields. */
export const AllMarksResponseSchema = z.object({
  marks: z.array(MarkRecordSchema).readonly(),
  refreshIntervalMs: z.number().int().min(250),
  revision: z.string().optional(),
  unchanged: z.boolean(),
}).strict()

/** Compile-time check that the list response schema matches the shared contract both ways. */
type _AllMarksResponseMatches = z.output<typeof AllMarksResponseSchema> extends AllMarksResponse
  ? AllMarksResponse extends z.output<typeof AllMarksResponseSchema> ? true : never
  : never
const _allMarksResponseCheck: _AllMarksResponseMatches = true
void _allMarksResponseCheck

/** Body accepted by the set action of the POST exact route and the `set_session_status` tool. */
export const SetMarkBodySchema = z.object({
  action: z.literal('set'),
  sessionId: z.string().min(1),
  status: z.enum(STATUS_VALUES),
  source: z.enum(EXPLICIT_SOURCES).default('manual'),
  note: z.string().max(DEFAULT_MAX_NOTE_LENGTH).nullable().default(null),
  subjectId: z.string().min(1).nullable().default(null),
}).strict()

/** Compile-time check that the set body matches the shared contract. */
type _SetMarkMatches = z.output<typeof SetMarkBodySchema> extends SetMarkBody
  ? SetMarkBody extends z.output<typeof SetMarkBodySchema> ? true : never
  : never
const _setMarkCheck: _SetMarkMatches = true
void _setMarkCheck

/** Body accepted by the clear action of the POST exact route. */
export const ClearMarkBodySchema = z.object({
  action: z.literal('clear'),
  sessionId: z.string().min(1),
}).strict()

/** Compile-time check that the clear body matches the shared contract. */
type _ClearMarkMatches = z.output<typeof ClearMarkBodySchema> extends ClearMarkBody
  ? ClearMarkBody extends z.output<typeof ClearMarkBodySchema> ? true : never
  : never
const _clearMarkCheck: _ClearMarkMatches = true
void _clearMarkCheck
