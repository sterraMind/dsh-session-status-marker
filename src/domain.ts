/** @module Storage domain definition for dsh-session-status-marker.
 *
 * Per `.research/dsh-repo/docs/subsystems/storage.md:5` "The storage subsystem
 * persists everything that is not a session event log". Out-of-tree bundles
 * cannot emit `ignorable: true` session events; see `docs/research/07-dsh-state-surfaces.md`.
 */

import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { MARK_VERSION, type MarkRecord, MarkRecordSchema } from './types.js'

/** Canonical unit name — required to match `UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/` (`.packages/storage/storage/src/backend.ts:10`). */
export const MARKER_DOMAIN_NAME = 'session_status_marker'

/** Canonical table name under the same regex constraint. */
export const MARKER_TABLE_NAME = 'marks'

/** Type-safe handle for the opened domain. Consumers hold the promise resolution from `ctx.storageDomain.open(MarkerDomainSpec)`. */
export type MarkerDomain = Domain<typeof MarkerDomainSpec>

/**
 * Domain spec literal. Throws immediately on import if any field is malformed
 * (fail-loud, per `.packages/storage/storage-domain/src/spec.ts:107-147`).
 * Uses `MarkRecordSchema` from `./types.js` so the single zod validation
 * boundary is defined once and reused by tools/routes/tests.
 */
export const MarkerDomainSpec = defineDomain({
  name: MARKER_DOMAIN_NAME,
  version: MARK_VERSION,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: {
    /** One durable row per session, keyed by the session ID. Overwrites on repeated set. */
    [MARKER_TABLE_NAME]: domainTable<string, MarkRecord>(MarkRecordSchema),
  },
})
