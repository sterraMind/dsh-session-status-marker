/** Contract tests: zod schemas accept valid rows and reject malformed ones. */

import { describe, it, expect } from './vitest-shim.mjs'
import {
  MarkRecordSchema,
  SetMarkBodySchema,
  ClearMarkBodySchema,
  STATUS_VALUES,
  STATUS_META,
  MARKER_STATE_PATH,
  MARKER_STATE_ROUTE,
  DEFAULT_MAX_NOTE_LENGTH,
} from '../lib/types.js'

const validRow = {
  version: 1,
  insertedAtMs: 100,
  seq: 3,
  sessionId: 's1',
  status: 'todo',
  source: 'manual',
  subjectId: null,
  autoReason: null,
  note: null,
  observedStatus: null,
  observedEvent: null,
  observedAtMs: null,
}

describe('MarkRecordSchema', () => {
  it('accepts a valid row', () => {
    expect(MarkRecordSchema.parse(validRow)).toEqual(validRow)
  })

  it('reads a row written before the observation layer existed', () => {
    // Every row on disk today predates the observation fields. `.strict()`
    // must not turn those rows into parse failures, or the whole snapshot
    // falls back on first read after the upgrade.
    const { observedStatus, observedEvent, observedAtMs, ...legacy } = validRow
    void observedStatus
    void observedEvent
    void observedAtMs
    expect(MarkRecordSchema.parse(legacy)).toEqual(validRow)
  })

  it('accepts a populated observation', () => {
    const populated = { ...validRow, observedStatus: 'todo', observedEvent: 'turn/start', observedAtMs: 42 }
    expect(MarkRecordSchema.parse(populated)).toEqual(populated)
  })

  it('rejects an unknown status', () => {
    expect(() => MarkRecordSchema.parse({ ...validRow, status: 'nope' })).toThrow()
  })

  it('rejects extra fields (strict)', () => {
    expect(() => MarkRecordSchema.parse({ ...validRow, extra: 1 })).toThrow()
  })

  it('rejects a note longer than DEFAULT_MAX_NOTE_LENGTH', () => {
    expect(() => MarkRecordSchema.parse({ ...validRow, note: 'x'.repeat(DEFAULT_MAX_NOTE_LENGTH + 1) })).toThrow()
  })
})

describe('SetMarkBodySchema', () => {
  it('fills defaults for source/note/subjectId', () => {
    const parsed = SetMarkBodySchema.parse({ action: 'set', sessionId: 's1', status: 'done' })
    expect(parsed).toEqual({ action: 'set', sessionId: 's1', status: 'done', source: 'manual', note: null, subjectId: null })
  })

  it('rejects source:auto on the manual route', () => {
    expect(() => SetMarkBodySchema.parse({ action: 'set', sessionId: 's1', status: 'done', source: 'auto' })).toThrow()
  })
})

describe('ClearMarkBodySchema', () => {
  it('accepts a clear body and rejects extra fields', () => {
    expect(ClearMarkBodySchema.parse({ action: 'clear', sessionId: 's1' })).toEqual({ action: 'clear', sessionId: 's1' })
    expect(() => ClearMarkBodySchema.parse({ action: 'clear', sessionId: 's1', note: 'x' })).toThrow()
  })
})

describe('shared constants', () => {
  it('has metadata for every status', () => {
    for (const s of STATUS_VALUES) expect(STATUS_META[s]).toBeDefined()
  })

  it('derives document-relative routes from absolute paths', () => {
    expect(MARKER_STATE_ROUTE).toBe(MARKER_STATE_PATH.slice(1))
  })
})
