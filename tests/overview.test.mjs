/** Overview route tests: grouping, title join, and the empty state.
 *
 * Same fake-ctx approach as `service.test.mjs`, plus `sessions` and
 * `sessionTitle` stubs so `#handleOverview` can join marks with titles.
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
 * @param {Map<string,string>} [opts.titles] session id -> title
 * @param {Set<string>} [opts.throwTitles] ids whose title read throws
 */
function makeCtx({ titles = new Map(), throwTitles = new Set() } = {}) {
  const table = makeTable()
  const routes = []
  const connection = { fetch: { register: (r) => { routes.push(r); return () => {} } } }
  const sessions = [...titles.keys()].map((id) => ({ id }))
  const sessionTitle = {
    get: (session) => {
      if (throwTitles.has(session.id)) throw new Error('title read failed')
      return titles.has(session.id) ? { title: titles.get(session.id) } : undefined
    },
  }
  const ctx = {
    reflect: { provide: () => {} },
    get: (name) => (name === 'connection' ? connection : undefined),
    inject: (deps, callback) => {
      if (deps.includes('connection') && connection === undefined) return
      callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    storageDomain: { open: async () => ({ table: () => table }) },
    tools: { register: () => () => {} },
    connection,
    sessions: { list: () => sessions },
    sessionTitle,
    effect: (fn) => fn(),
    on: () => {},
    logger: { warn: () => {} },
  }
  return { ctx, routes, table }
}

const CONFIG = { autoInfer: false, maxNoteLength: 20, autoExpireMs: 0, refreshIntervalMs: 2000 }

function row(sessionId, status, insertedAtMs) {
  return { version: 1, insertedAtMs, seq: 0, sessionId, status, source: 'manual', subjectId: null, autoReason: null, note: null }
}

async function boot({ titles, throwTitles }) {
  const { ctx, routes, table } = makeCtx({ titles, throwTitles })
  const svc = new SessionStatusService(ctx, { ...CONFIG })
  await svc[Service.init]()
  const overviewRoute = routes.find((r) => r.path.endsWith('.overview'))
  return { svc, table, overviewRoute }
}

async function callOverview(overviewRoute) {
  const resp = await overviewRoute.fetch()
  return resp.json()
}

describe('overview route', () => {
  it('groups marks by status, sorts each group by updatedAtMs descending', async () => {
    const { table, overviewRoute } = await boot({ titles: new Map(), throwTitles: new Set() })
    await table.put('s1', row('s1', 'todo', 100))
    await table.put('s2', row('s2', 'todo', 300))
    await table.put('s3', row('s3', 'done', 200))
    const data = await callOverview(overviewRoute)
    expect(data.totalMarked).toBe(3)
    // Groups appear in STATUS_VALUES order: todo before done.
    expect(data.groups.map((g) => g.status)).toEqual(['todo', 'done'])
    expect(data.groups[0].count).toBe(2)
    // Group members sorted descending by updatedAtMs.
    expect(data.groups[0].entries.map((e) => e.sessionId)).toEqual(['s2', 's1'])
    expect(data.groups[1].entries.map((e) => e.sessionId)).toEqual(['s3'])
  })

  it('includes only non-empty groups', async () => {
    const { table, overviewRoute } = await boot({ titles: new Map(), throwTitles: new Set() })
    await table.put('s1', row('s1', 'todo', 100))
    const data = await callOverview(overviewRoute)
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].status).toBe('todo')
  })

  it('joins session titles from the title service', async () => {
    const titles = new Map([['s1', 'Alpha session'], ['s2', 'Beta session']])
    const { table, overviewRoute } = await boot({ titles, throwTitles: new Set() })
    await table.put('s1', row('s1', 'todo', 100))
    await table.put('s2', row('s2', 'done', 200))
    const data = await callOverview(overviewRoute)
    const byId = Object.fromEntries(data.groups.flatMap((g) => g.entries.map((e) => [e.sessionId, e])))
    expect(byId.s1.title).toBe('Alpha session')
    expect(byId.s2.title).toBe('Beta session')
  })

  it('returns a null title when the session is absent or the title read throws', async () => {
    // s2 is absent from `titles` (no live session); s3 is present but its title read throws.
    const titles = new Map([['s1', 'Alpha'], ['s3', 'Throwing']])
    const throwTitles = new Set(['s3'])
    const { table, overviewRoute } = await boot({ titles, throwTitles })
    await table.put('s1', row('s1', 'todo', 100))
    await table.put('s2', row('s2', 'todo', 200))
    await table.put('s3', row('s3', 'todo', 300))
    const data = await callOverview(overviewRoute)
    const byId = Object.fromEntries(data.groups.flatMap((g) => g.entries.map((e) => [e.sessionId, e])))
    // s2 has no live session (not in titles keys) -> null title.
    expect(byId.s2.title).toBeNull()
    // s3 session exists but the title read throws -> null title.
    expect(byId.s3.title).toBeNull()
    expect(byId.s1.title).toBe('Alpha')
  })

  it('reports the empty state when there are no marks', async () => {
    const { table, overviewRoute } = await boot({ titles: new Map(), throwTitles: new Set() })
    void table
    const data = await callOverview(overviewRoute)
    expect(data.groups).toEqual([])
    expect(data.totalMarked).toBe(0)
    expect(data.refreshIntervalMs).toBe(2000)
  })
})
