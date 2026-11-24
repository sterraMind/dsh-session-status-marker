/** Merge-batch regression: a slow Host must answer overview in ONE deadline,
 * not two serial ones. Guards the fix for the local desktop board that used
 * to hit the client's 8-second abort (marked-cold titles read in wave one,
 * unmarked titles re-read in wave two).
 *
 * The second describe block pins the background refresh behavior: the
 * marked-rows title batch runs before the unmarked-candidates batch, the
 * fifteen-second background budget absorbs a slow candidate batch that the old
 * four-second one aborted, an aborted or rejected batch — and a missing
 * sessionQuery service — is logged instead of swallowed, and a title-less id
 * is negative-cached so it is not re-read inside its absence window.
 */

import { describe, it, expect } from './vitest-shim.mjs'
import { Service } from '@deepseek-ai/cordis'
import { SessionStatusService } from '../lib/service.js'
import { OVERVIEW_SERVICE_TIMEOUT_MS } from '../lib/contracts.js'

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
 * @param {boolean} [opts.query] false → the sessionQuery service is not mounted
 * @param {(ids: string[], signal?: AbortSignal) => Promise<unknown>} [opts.readTitleSnapshots] replace the default fake (calls are still recorded)
 */
function makeCtx({ coldTitles = new Map(), titleStuck = false, listStuck = false, persisted = [], query = true, readTitleSnapshots = null } = {}) {
  const table = makeTable()
  const routes = []
  const state = { titleCalls: 0, lastIds: [], calls: [], logs: [] }
  const connection = { fetch: { register: (r) => { routes.push(r); return () => {} } } }
  const sessionQuery = query === false ? undefined : {
    readTitleSnapshots: async (ids, signal) => {
      state.titleCalls += 1
      state.lastIds = [...ids]
      state.calls.push([...ids])
      if (readTitleSnapshots !== null) return readTitleSnapshots(ids, signal)
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
    logger: { warn: (...args) => { state.logs.push(args.map(String).join(' ')) } },
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

/**
 * Like boot, but registers the marks BEFORE Service.init so the warm-up
 * refresh itself sees them — which is how the split between the marked-rows
 * batch and the unmarked-candidates batch shows up in state.calls.
 *
 * @param {Array<[string, string, number]>} marks [sessionId, status, insertedAtMs]
 */
async function bootWithMarks(marks, opts = {}) {
  const { ctx, routes, table, state } = makeCtx(opts)
  for (const [sessionId, status, insertedAtMs] of marks) {
    await table.put(sessionId, row(sessionId, status, insertedAtMs))
  }
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
  it('names both marked and unmarked rows in the first refresh, marked batch first', async () => {
    const coldTitles = new Map([['m1', 'Marked cold'], ['u1', 'Unmarked cold']])
    const persisted = [{ id: 'm1', createdAt: 100 }, { id: 'u1', createdAt: 900 }]
    // Marks registered before init, so the warm-up refresh itself performs
    // the split: one batch for the marked rows, one for the unmarked
    // candidates — in that order.
    const { table, overviewRoute, state } = await bootWithMarks([['m1', 'todo', 100]], { coldTitles, persisted })
    const first = await callOverview(overviewRoute)
    expect(first.groups[0].entries[0].title).toBe('Marked cold')
    expect(first.unmarked.entries[0].title).toBe('Unmarked cold')
    // Two batches, marked rows first: a merged single batch is the regression
    // that starved the marked rows behind slow unmarked candidates.
    expect(state.titleCalls).toBe(2)
    expect(state.calls[0]).toEqual(['m1'])
    expect(state.calls[1]).toEqual(['u1'])
    // Everything is inside the ten-second cache window: the next poll reads
    // nothing new.
    await callOverview(overviewRoute)
    expect(state.titleCalls).toBe(2)
  })

  it('answers within the refresh wait when both title and list reads hang', async () => {
    const { table, overviewRoute } = await boot({ titleStuck: true, listStuck: true })
    await table.put('m1', row('m1', 'todo', 100))
    const t0 = Date.now()
    const result = await callOverview(overviewRoute)
    const elapsed = Date.now() - t0
    // The scan runs behind the response: a request joins it for at most
    // OVERVIEW_REFRESH_WAIT_MS, then answers with the last snapshot. Two serial
    // service-deadline waves used to cost 8s and trip the client's abort.
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

describe('overview background title batches', () => {
  it('reads the marked rows before the unmarked candidates and survives a slow candidate batch', async () => {
    const coldTitles = new Map([['m1', 'Marked cold'], ['u1', 'Unmarked cold']])
    const persisted = [{ id: 'm1', createdAt: 100 }, { id: 'u1', createdAt: 900 }]
    // The candidate batch needs 4.5 s: past the old four-second budget (which
    // aborted the whole merged batch before anything was cached), inside the
    // fifteen-second background budget.
    const readTitleSnapshots = async (ids) => {
      await new Promise((resolve) => setTimeout(resolve, ids.some((id) => id === 'u1') ? 4500 : 100))
      return ids.map((id) => (
        coldTitles.has(id)
          ? { sessionId: id, status: 'fulfilled', value: { session: { id }, title: { title: coldTitles.get(id) } } }
          : { sessionId: id, status: 'rejected', reason: 'not found' }
      ))
    }
    const { table, overviewRoute, state } = await bootWithMarks([['m1', 'todo', 100]], { coldTitles, persisted, readTitleSnapshots })
    const first = await callOverview(overviewRoute)
    // The request gave up after the two-second refresh wait: the fast
    // marked-rows batch has landed, the slow candidate batch has not yet.
    expect(first.groups[0].entries[0].title).toBe('Marked cold')
    expect(first.unmarked.entries[0].title).toBeNull()
    // Two separate batches, marked rows first — not one merged batch.
    expect(state.titleCalls).toBe(2)
    expect(state.calls[0]).toEqual(['m1'])
    expect(state.calls[1]).toEqual(['u1'])
    // Let the candidate batch settle in the background, then poll again: the
    // board fills in from the cache and the engine is not asked again.
    const waitStart = Date.now()
    while (Date.now() - waitStart < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const second = await callOverview(overviewRoute)
    expect(second.groups[0].entries[0].title).toBe('Marked cold')
    expect(second.unmarked.entries[0].title).toBe('Unmarked cold')
    expect(state.titleCalls).toBe(2)
  })

  it('negative-caches a title-less id so the next refresh does not re-read it', async () => {
    const readTitleSnapshots = (ids) => Promise.resolve(ids.map((id) => (
      id === 'm1'
        ? { sessionId: id, status: 'fulfilled', value: { session: { id }, title: { title: 'Marked cold' } } }
        : { sessionId: id, status: 'rejected', reason: 'no title event' }
    )))
    const { table, overviewRoute, state } = await bootWithMarks([['m1', 'todo', 100], ['m2', 'todo', 200]], { readTitleSnapshots })
    const first = await callOverview(overviewRoute)
    const firstById = Object.fromEntries(first.groups.flatMap((g) => g.entries.map((e) => [e.sessionId, e])))
    expect(firstById.m1.title).toBe('Marked cold')
    expect(firstById.m2.title).toBeNull()
    expect(state.titleCalls).toBe(1)
    // Second refresh: m1 is inside its one-minute window, m2 inside its
    // five-minute absence window, so the stale set is empty and the engine is
    // never asked again.
    const second = await callOverview(overviewRoute)
    const secondById = Object.fromEntries(second.groups.flatMap((g) => g.entries.map((e) => [e.sessionId, e])))
    expect(secondById.m1.title).toBe('Marked cold')
    expect(secondById.m2.title).toBeNull()
    expect(state.titleCalls).toBe(1)
  })

  it('logs an aborted cold-title batch instead of swallowing it', async () => {
    // The fake engine hangs until its signal is aborted, like the production
    // engine whose transcript scan outruns the budget. The fifteen-second
    // batch deadline is scaled to 500 ms (no other timer in this scenario is
    // that long — the two-second refresh wait stays real) so the test drives
    // the real abort path without waiting the full budget out.
    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn, ms, ...args) =>
      realSetTimeout(fn, ms === OVERVIEW_SERVICE_TIMEOUT_MS ? 500 : ms, ...args)
    const readTitleSnapshots = (_ids, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
    try {
      const { table, overviewRoute, state } = await bootWithMarks([['m1', 'todo', 100]], { readTitleSnapshots })
      const result = await callOverview(overviewRoute)
      expect(result.groups[0].entries[0].title).toBeNull()
      // The failed batch must reach the Host log, not die in a bare catch.
      expect(state.logs.some((line) => line.includes('cold title read aborted'))).toBe(true)
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
  })

  it('logs a missing sessionQuery service once and keeps answering', async () => {
    const { table, overviewRoute, state } = await bootWithMarks([['m1', 'todo', 100]], { query: false })
    const first = await callOverview(overviewRoute)
    expect(first.groups[0].entries[0].title).toBeNull()
    const second = await callOverview(overviewRoute)
    expect(second.groups[0].entries[0].title).toBeNull()
    // One warning across both refreshes, not one per two-second poll.
    const missing = state.logs.filter((line) => line.includes('sessionQuery'))
    expect(missing.length).toBe(1)
  })
})
