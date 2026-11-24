/** Merge-batch regression: a slow Host must answer overview in ONE deadline,
 * not two serial ones. Guards the fix for the local desktop board that used
 * to hit the client's 8-second abort (marked-cold titles read in wave one,
 * unmarked titles re-read in wave two).
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
 * @param {Map<string,string>} [opts.coldTitles]
 * @param {boolean} [opts.titleStuck] make readTitleSnapshots hang until aborted
 * @param {boolean} [opts.listStuck] make listSessions hang
 * @param {Array<{id:string,createdAt:number}>} [opts.persisted]
 */
function makeCtx({ coldTitles = new Map(), titleStuck = false, listStuck = false, persisted = [] } = {}) {
  const table = makeTable()
  const routes = []
  const state = { titleCalls: 0, lastIds: [] }
  const connection = { fetch: { register: (r) => { routes.push(r); return () => {} } } }
  const sessionQuery = {
    readTitleSnapshots: async (ids, signal) => {
      state.titleCalls += 1
      state.lastIds = [...ids]
      if (titleStuck) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
      return ids.map((id) => (
        coldTitles.has(id)
          ? { sessionId: id, status: 'fulfilled', value: { session: { id }, title: { title: coldTitles.get(id) } } }
          : { sessionId: id, status: 'rejected', reason: 'not found' }
      ))
    },
    listSessions: async () => {
      if (listStuck) return new Promise(() => {})
      return persisted.map((s) => ({ header: { id: s.id, createdAt: s.createdAt } }))
    },
  }
  const sessionPersistence = persisted.length > 0
    ? { list: async () => persisted.map((p) => ({ header: { id: p.id, createdAt: p.createdAt } })) }
    : undefined
  const optionalService = (name) => {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'sessionPersistence') return sessionPersistence
    if (name === 'connection') return connection
    return undefined
  }
  const ctx = {
    reflect: { provide: () => {}, get: optionalService },
    get: optionalService,
    inject: (deps, callback) => {
      if (deps.includes('connection')) callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    storageDomain: { open: async () => ({ table: () => table }) },
    tools: { register: () => () => {} },
    connection,
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

async function callOverview(overviewRoute) {
  const url = `http://localhost${overviewRoute.path}`
  const resp = await overviewRoute.fetch(new Request(url))
  return resp.json()
}

describe('overview merge-batch', () => {
  it('reads cold titles once for both marked and unmarked rows', async () => {
    const coldTitles = new Map([['m1', 'Marked cold'], ['u1', 'Unmarked cold']])
    const persisted = [{ id: 'm1', createdAt: 100 }, { id: 'u1', createdAt: 900 }]
    const { table, overviewRoute, state } = await boot({ coldTitles, persisted })
    await table.put('m1', row('m1', 'todo', 100))
    const first = await callOverview(overviewRoute)
    expect(first.groups[0].entries[0].title).toBe('Marked cold')
    // Both rows are named by the FIRST wave: the unmarked candidate set is
    // resolved before the title read, so no second serial wave is needed.
    expect(first.unmarked.entries[0].title).toBe('Unmarked cold')
    expect(state.titleCalls).toBe(1)
    expect([...state.lastIds].sort()).toEqual(['m1', 'u1'])
    // Everything is inside the ten-second cache window: no further scan.
    await callOverview(overviewRoute)
    expect(state.titleCalls).toBe(1)
  })

  it('answers within the refresh wait when both title and list reads hang', async () => {
    const { table, overviewRoute } = await boot({ titleStuck: true, listStuck: true })
    await table.put('m1', row('m1', 'todo', 100))
    const t0 = Date.now()
    const result = await callOverview(overviewRoute)
    const elapsed = Date.now() - t0
    // The scan runs behind the response: a request joins it for at most
    // OVERVIEW_REFRESH_WAIT_MS, then answers with the last snapshot. Two serial
    // four-second waves used to cost 8s and trip the client's abort.
    expect(elapsed).toBeLessThan(3000)
    expect(result.totalMarked).toBe(1)
  })

  it('does not wait for the corpus scan once the caches are warm', async () => {
    const coldTitles = new Map([['m1', 'Marked cold']])
    const persisted = [{ id: 'm1', createdAt: 100 }]
    const { table, overviewRoute } = await boot({ coldTitles, persisted })
    await table.put('m1', row('m1', 'todo', 100))
    await callOverview(overviewRoute)
    // Warm caches: the refresh is a TTL hit, so the response is immediate even
    // though a slow title read could still be outstanding.
    const t0 = Date.now()
    await callOverview(overviewRoute)
    expect(Date.now() - t0).toBeLessThan(300)
  })
})
