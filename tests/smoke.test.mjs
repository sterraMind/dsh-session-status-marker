/** @module Smoke test: end-to-end host lifecycle over one session.
 *
 * Builds a minimal fake Cordis context around an in-memory storage domain so
 * SessionStatusService runs its `[Service.init]()` path without launching DSH.
 * This is intentionally lighter than `service.test.mjs`: it asserts one
 * concrete inference round-trip instead of every schema edge case.
 */

import { describe, it, expect } from './vitest-shim.mjs'
import { Service } from '@deepseek-ai/cordis'
import SessionStatusService, { Config } from '../lib/service.js'
import { MARKER_TABLE_NAME } from '../lib/domain.js'

describe('smoke: one inference round-trip', () => {
  it('writes an auto mark from a turn/end:aborted event, reads it back through effectiveMark and GET state route', async () => {
    // -- fake domain ---------------------------------------------------------
    const store = new Map()
    const table = {
      get(k) { return store.get(k) ?? undefined },
      entries() { return store.entries() },
      put(k, v) { store.set(k, v); return Promise.resolve() },
      delete(k) { store.delete(k); return Promise.resolve(true) },
      update() { throw new Error('not used') },
      keys() { return store.keys() },
      size: store.size,
      deleteMany() { throw new Error('not used') },
    }
    const domain = {
      name: 'session_status_marker',
      global: { get() { return null } },
      table(name) {
        if (name !== MARKER_TABLE_NAME) throw new Error(`unknown table ${String(name)}`)
        return table
      },
      close() { return Promise.resolve() },
    }

    // -- fake ctx ------------------------------------------------------------
    const tools = new Map()
    const routes = []
    const listeners = []
    const connection = { fetch: { register: (r) => { routes.push(r); return () => {} } } }
    const ctx = {
      storageDomain: { open: async () => domain },
      tools: { register: (t) => { tools.set(t.name, t); return () => tools.delete(t.name) } },
      get: (name) => (name === 'connection' ? connection : undefined),
      inject: (deps, callback) => {
        if (deps.includes('connection') && connection === undefined) return
        callback({ ...ctx, connection, effect: (fn) => fn() })
      },
      inject: (deps, callback) => {
        if (deps.includes('connection') && connection === undefined) return
        callback({ ...ctx, connection, effect(fn, _label) { fn() } })
      },
      connection,
      effect(fn, _label) { fn() },
      on(event, handler, _opts) { listeners.push({ event, handler }) },
      logger: { warn(...a) { /* swallow */ } },
      disposed: false,
      reflect: { provide: () => {} },
    }

    // -- boot ----------------------------------------------------------------
    const svc = new SessionStatusService(ctx, { autoInfer: true, maxNoteLength: 200, autoExpireMs: 0 })
    await svc[Service.init]()

    // -- fire one turn/end:aborted event ------------------------------------
    const hook = listeners.find((l) => l.event === 'session/event')?.handler
    expect(hook).toBeDefined()
    hook(
      { id: 'sess-abc' },
      { type: 'turn/end', seq: 12, time: 1_700_000_000_000, data: { reason: { kind: 'aborted' } } },
    )
    await new Promise((r) => setTimeout(r, 0))

    // -- assert persistence + read-back via effectiveMark ---------------------
    expect(store.size).toBe(1)
    const row = store.get('sess-abc')
    expect(row).toMatchObject({
      version: 1, source: 'auto', status: 'stopped', autoReason: 'turn-interrupted',
      sessionId: 'sess-abc', subjectId: null, note: null,
    })
    const effective = await svc.effectiveMark('sess-abc')
    expect(effective).toEqual(row)

    // -- assert GET state route returns the same mark ------------------------
    const stateRoute = routes.find((r) => r.path === '/api/session-status-marker.state')
    expect(stateRoute).toBeDefined()
    const stateResp = await stateRoute.fetch(new Request('http://x/api/session-status-marker.state?sessionId=sess-abc'))
    expect(stateResp.status).toBe(200)
    const body = await stateResp.json()
    expect(body.sessionId).toBe('sess-abc')
    expect(body.mark).toEqual(row)

    // -- assert inference skips when no semantic match -----------------------
    const inferredBefore = store.size
    hook({ id: 'sess-abc' }, { type: 'step/start', seq: 13, time: Date.now(), data: {} })
    await new Promise((r) => setTimeout(r, 0))
    expect(store.size).toBe(inferredBefore)
  })
})
