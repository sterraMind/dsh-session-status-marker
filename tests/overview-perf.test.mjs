/** Overview performance behavior tests: single-flight coalescing of the shared
 * cross-corpus scan, TTL caching, stale-on-failure degradation, deadline
 * fallback for a stuck query engine, and the conditional-refresh round trip.
 *
 * Same fake-ctx approach as `overview.test.mjs`, with a controllable
 * `listSessions` so the tests can count scans and control their duration.
 */

import { describe, it, expect } from './vitest-shim.mjs'
import { Service } from '@deepseek-ai/cordis'
import { SessionStatusService } from '../lib/service.js'

function makeTable() {
  const map = new Map()
  return {
    get: (k) => map.get(k),
    entries: () => map.entries(),
    keys: () => map.keys(),
    get size() { return map.size },
    put: async (k, v) => { map.set(k, v) },
    delete: async (k) => map.delete(k),
    deleteMany: async () => 0,
    update: async (k, fn) => { const v = fn(map.get(k)); map.set(k, v); return v },
  }
}

/**
 * @param {object} opts
 * @param {Array<{id:string,createdAt:number}>} [opts.allSessions] every session the query engine can list
 * @param {number} [opts.delayMs] artificial duration of each `listSessions` call
 * @param {boolean} [opts.fail] make `listSessions` reject
 * @param {boolean} [opts.stuck] make `listSessions` never settle
 */
function makeCtx({ allSessions = [], delayMs = 0, fail = false, stuck = false } = {}) {
  const table = makeTable()
  const routes = []
  const connection = { fetch: { register: (r) => { routes.push(r); return () => {} } } }
  const state = { calls: 0 }
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
  const sessionQuery = {
    listSessions: async () => {
      state.calls += 1
      if (stuck) return new Promise(() => {})
      if (delayMs > 0) await sleep(delayMs)
      if (fail) throw new Error('query engine down')
      return allSessions.map((s) => ({ header: { id: s.id, createdAt: s.createdAt } }))
    },
  }
  const optionalService = (name) => {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'connection') return connection
    return undefined
  }
  const ctx = {
    reflect: { provide: () => {}, get: optionalService },
    get: optionalService,
    inject: (deps, callback) => {
      if (deps.includes('connection') && connection === undefined) return
      callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    storageDomain: { open: async () => ({ table: () => table }) },
    tools: { register: () => () => {} },
    connection,
    sessionQuery,
    sessions: { list: () => [], get: () => undefined },
    sessionTitle: { get: () => undefined },
    effect: (fn) => fn(),
    on: () => {},
    logger: { warn: () => {} },
  }
  return { ctx, routes, table, state }
}

const CONFIG = { autoInfer: false, maxNoteLength: 20, autoExpireMs: 0, refreshIntervalMs: 2000 }

function row(sessionId, status, insertedAtMs) {
  return { version: 1, insertedAtMs, seq: 0, sessionId, status, source: 'manual', subjectId: null, autoReason: null, note: null }
}

async function boot(opts = {}) {
  const { ctx, routes, table, state } = makeCtx(opts)
  const svc = new SessionStatusService(ctx, { ...CONFIG })
  await svc[Service.init]()
  const overviewRoute = routes.find((r) => r.path.endsWith('.overview'))
  return { table, overviewRoute, state }
}

async function callOverview(overviewRoute, since) {
  const url = `http://localhost${overviewRoute.path}` + (since === undefined ? '' : `?since=${encodeURIComponent(since)}`)
  const resp = await overviewRoute.fetch(new Request(url))
  const data = await resp.json()
  return { status: resp.status, data }
}

describe('overview performance behavior', () => {
  it('shares one listSessions scan between concurrent overview requests', async () => {
    const allSessions = [{ id: 'u1', createdAt: 900 }, { id: 'u2', createdAt: 500 }, { id: 'u3', createdAt: 700 }]
    const { overviewRoute, state } = await boot({ allSessions, delayMs: 250 })
    const [a, b] = await Promise.all([callOverview(overviewRoute), callOverview(overviewRoute)])
    expect(state.calls).toBe(1)
    expect(a.data.unmarked.count).toBe(3)
    expect(b.data.unmarked.count).toBe(3)
    expect(a.data.revision).toBe(b.data.revision)
  })

  it('serves a second request inside the TTL window from the cached snapshot', async () => {
    const allSessions = [{ id: 'u1', createdAt: 900 }, { id: 'u2', createdAt: 500 }]
    const { overviewRoute, state } = await boot({ allSessions })
    const first = await callOverview(overviewRoute)
    expect(state.calls).toBe(1)
    const second = await callOverview(overviewRoute)
    expect(state.calls).toBe(1)
    expect(second.data.unmarked.count).toBe(2)
    expect(second.data.revision).toBe(first.data.revision)
  })

  it('keeps the previous snapshot and throttles retries when the query engine fails', async () => {
    const allSessions = [{ id: 'u1', createdAt: 900 }]
    const { table, overviewRoute, state } = await boot({ allSessions, fail: true })
    const { status, data } = await callOverview(overviewRoute)
    expect(status).toBe(200)
    // The failed scan degraded to the (empty) previous snapshot: no unmarked rows.
    expect(data.unmarked).toEqual({ count: 0, entries: [] })
    expect(state.calls).toBe(1)
    // The failure advanced the TTL clock, so the immediate retry is served from
    // the cache instead of starting another failing scan.
    const again = await callOverview(overviewRoute)
    expect(again.status).toBe(200)
    expect(state.calls).toBe(1)
    void table
  })

  it('degrades through the service deadline when the query engine never settles', async () => {
    const { overviewRoute } = await boot({ allSessions: [{ id: 'u1', createdAt: 900 }], stuck: true })
    const t0 = Date.now()
    const { status, data } = await callOverview(overviewRoute)
    const elapsed = Date.now() - t0
    expect(status).toBe(200)
    expect(data.unmarked).toEqual({ count: 0, entries: [] })
    // The request joins the background refresh for at most
    // OVERVIEW_REFRESH_WAIT_MS (2000 ms) and then answers from the caches —
    // the board must never hang, no matter how long the background reads take.
    expect(elapsed).toBeLessThan(5500)
  })

  it('echoes an unchanged response when since matches the current revision', async () => {
    const { table, overviewRoute } = await boot({ allSessions: [{ id: 'u1', createdAt: 900 }] })
    await table.put('m1', row('m1', 'todo', 100))
    const first = await callOverview(overviewRoute)
    expect(first.data.revision).toBeTruthy()
    const echo = await callOverview(overviewRoute, first.data.revision)
    expect(echo.data.unchanged).toBe(true)
    expect(echo.data.groups).toBeUndefined()
    expect(echo.data.totalMarked).toBeUndefined()
    expect(echo.data.refreshIntervalMs).toBe(2000)
    const stale = await callOverview(overviewRoute, 'not-a-real-revision')
    expect(stale.data.unchanged).toBe(false)
    expect(stale.data.totalMarked).toBe(1)
  })

  it('fills the unmarked block from the shared snapshot instead of a fresh scan', async () => {
    const allSessions = [
      { id: 'm1', createdAt: 100 },
      { id: 'u1', createdAt: 900 },
      { id: 'u2', createdAt: 500 },
    ]
    const { table, overviewRoute, state } = await boot({ allSessions })
    await table.put('m1', row('m1', 'todo', 100))
    const { data } = await callOverview(overviewRoute)
    expect(state.calls).toBe(1)
    expect(data.unmarked.count).toBe(2)
    expect(data.unmarked.entries.map((e) => e.sessionId)).toEqual(['u1', 'u2'])
    expect(data.unmarked.entries.some((e) => e.sessionId === 'm1')).toBe(false)
  })
})
