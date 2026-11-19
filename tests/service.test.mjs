/** Integration-style unit tests for the host service using a fake Cordis context.
 *
 * We never boot a real session log; instead we stub the three surfaces the
 * service depends on — `storageDomain.open`, `connection.fetch.register`,
 * `tools.register` — so the storage/route/tool wiring can be exercised directly.
 */

import { describe, it, expect, beforeEach } from './vitest-shim.mjs'
import { Service } from '@deepseek-ai/cordis'
import { SessionStatusService } from '../lib/service.js'

/** Minimal in-memory KvTable satisfying the storage-domain contract. */
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

function makeCtx(withConnection = true) {
  const tools = []
  const routes = []
  const listeners = []
  const injections = []
  const table = makeTable()
  const connection = withConnection
    ? { fetch: { register: (r) => { routes.push(r); return () => {} } } }
    : undefined
  const ctx = {
    reflect: { provide: () => {} },
    get: (name) => (name === 'connection' ? connection : undefined),
    // `ctx.inject` runs its callback only once every named service exists, so a
    // composition without a bridge renders no routes: the callback never fires.
    inject: (deps, callback) => {
      if (deps.includes('connection') && connection === undefined) return
      callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    // `ctx.inject` fires only once every named service exists, so a composition
    // without a bridge never runs the callback and renders no routes.
    inject: (deps, callback) => {
      if (deps.includes('connection') && connection === undefined) return
      callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    // Mirrors `Context.inject`: the callback runs only once the named service
    // exists, and receives a child scope that reaches it.
    inject: (deps, callback) => {
      if (deps.includes('connection') && connection === undefined) return
      callback({ ...ctx, connection, effect: (fn) => fn() })
    },
    storageDomain: { open: async () => ({ table: () => table }) },
    tools: { register: (t) => { tools.push(t); return () => {} } },
    connection,
    effect: (fn) => fn(),
    // Only session/event listeners go to `listeners`; the webserver injection
    // listener is captured separately so it cannot shift inference test indices.
    on: (name, listener) => {
      if (name === 'session/event') listeners.push(listener)
      else if (name === 'webserver/index-inject') injections.push(listener)
      return () => {}
    },
    logger: { warn: () => {} },
  }
  return { ctx, tools, routes, table, listeners, injections }
}

const CONFIG = { autoInfer: false, maxNoteLength: 20, autoExpireMs: 0, refreshIntervalMs: 2000 }

async function bootService(autoInfer = false, withConnection = true) {
  const { ctx, tools, routes, table, listeners, injections } = makeCtx(withConnection)
  const svc = new SessionStatusService(ctx, { ...CONFIG, autoInfer })
  await svc[Service.init]()
  return { svc, tools, routes, table, listeners, injections }
}

describe('SessionStatusService storage', () => {
  let svc
  beforeEach(async () => { ({ svc } = await bootService()) })

  it('writes and reads a manual mark', async () => {
    await svc.putMark(svc.explicitRow('s1', 'done', null, null))
    expect(svc.getMark('s1')?.status).toBe('done')
  })

  it('clears a mark', async () => {
    await svc.putMark(svc.explicitRow('s1', 'blocked', null, null))
    expect(await svc.clearMark('s1')).toBe(true)
    expect(svc.getMark('s1')).toBeNull()
  })

  it('lists stored rows', async () => {
    await svc.putMark(svc.explicitRow('s1', 'todo', null, null))
    await svc.putMark(svc.explicitRow('s2', 'done', null, null))
    expect([...svc.listAll()].length).toBe(2)
  })
})

describe('SessionStatusService exact routes', () => {
  it('skips route registration when no connection bridge is mounted', async () => {
    const { tools, routes } = await bootService(false, false)
    expect(routes.length).toBe(0)
    expect(tools.length).toBe(2)
  })

  it('state route 400s without sessionId', async () => {
    const { routes } = await bootService()
    const route = routes.find((r) => r.path.endsWith('.state'))
    const res = await route.fetch(new Request('http://x/api/session-status-marker.state'))
    expect(res.status).toBe(400)
  })

  it('state route returns the stored mark', async () => {
    const { svc, routes } = await bootService()
    await svc.putMark(svc.explicitRow('s1', 'review', null, null))
    const route = routes.find((r) => r.path.endsWith('.state'))
    const res = await route.fetch(new Request('http://x/api/session-status-marker.state?sessionId=s1'))
    expect(await res.json()).toMatchObject({ sessionId: 's1', mark: { status: 'review' } })
  })

  it('list route reports the configured refresh cadence', async () => {
    const { svc, routes } = await bootService()
    await svc.putMark(svc.explicitRow('s1', 'todo', null, null))
    const route = routes.find((r) => r.path.endsWith('.list'))
    const res = await route.fetch(new Request('http://x/api/session-status-marker.list'))
    expect(await res.json()).toMatchObject({ refreshIntervalMs: 2000, marks: [{ sessionId: 's1', status: 'todo' }], unchanged: false })
  })

  it('list route returns a stable derived revision and skips rows when since matches', async () => {
    const { svc, routes } = await bootService()
    await svc.putMark(svc.explicitRow('s1', 'todo', null, null))
    const route = routes.find((r) => r.path.endsWith('.list'))
    const first = await (await route.fetch(new Request('http://x/api/session-status-marker.list'))).json()
    expect(typeof first.revision).toBe('string')
    expect(first.revision.length > 0).toBe(true)
    expect(first.unchanged).toBe(false)

    const second = await (await route.fetch(new Request(`http://x/api/session-status-marker.list?since=${encodeURIComponent(first.revision)}`))).json()
    expect(second).toMatchObject({ marks: [], revision: first.revision, unchanged: true, refreshIntervalMs: 2000 })
  })

  it('derives the same revision from the same rows after a fresh service instance', async () => {
    const row = (sessionId, status) => ({
      version: 1, insertedAtMs: 100, seq: 0, sessionId, status,
      source: 'manual', subjectId: null, autoReason: null, note: null,
    })
    const first = await bootService()
    await first.svc.putMark(row('s1', 'todo'))
    await first.svc.putMark(row('s2', 'done'))
    const firstRoute = first.routes.find((r) => r.path.endsWith('.list'))
    const firstBody = await (await firstRoute.fetch(new Request('http://x/api/session-status-marker.list'))).json()

    const second = await bootService()
    await second.svc.putMark(row('s1', 'todo'))
    await second.svc.putMark(row('s2', 'done'))
    const secondRoute = second.routes.find((r) => r.path.endsWith('.list'))
    const secondBody = await (await secondRoute.fetch(new Request('http://x/api/session-status-marker.list'))).json()
    expect(secondBody.revision).toBe(firstBody.revision)
  })

  it('mutate set then clear round-trips', async () => {
    const { svc, routes } = await bootService()
    const mutate = routes.find((r) => r.path.endsWith('.mutate'))
    const setRes = await mutate.fetch(new Request('http://x/api/session-status-marker.mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', sessionId: 's1', status: 'done', source: 'manual', note: null, subjectId: null }),
    }))
    expect((await setRes.json()).ok).toBe(true)
    expect(svc.getMark('s1')?.status).toBe('done')

    const clearRes = await mutate.fetch(new Request('http://x/api/session-status-marker.mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', sessionId: 's1' }),
    }))
    expect((await clearRes.json()).deleted).toBe(true)
    expect(svc.getMark('s1')).toBeNull()
  })

  it('rejects an unsupported action', async () => {
    const { routes } = await bootService()
    const mutate = routes.find((r) => r.path.endsWith('.mutate'))
    const res = await mutate.fetch(new Request('http://x/api/session-status-marker.mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'frobnicate', sessionId: 's1' }),
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('unsupported-action')
  })
})

describe('SessionStatusService tools', () => {
  it('registers set_session_status and clear_session_status', async () => {
    const { tools } = await bootService()
    const names = tools.map((t) => t.name)
    expect(names).toContain('set_session_status')
    expect(names).toContain('clear_session_status')
  })

  it('set_session_status records a mark for the agent session', async () => {
    const { svc, tools } = await bootService()
    const tool = tools.find((t) => t.name === 'set_session_status')
    const result = await tool.execute({ status: 'stopped', note: 'boom' }, { agent: { id: 'session-7' } })
    expect(result).toMatchObject({ ok: true, sessionId: 'session-7', status: 'stopped' })
    expect(svc.getMark('session-7')?.source).toBe('manual')
  })

  it('set_session_status lists all eight statuses and the override rules', async () => {
    const { tools } = await bootService()
    const description = tools.find((t) => t.name === 'set_session_status').description
    for (const status of ['todo', 'done', 'stopped', 'blocked', 'review', 'pending-subagent', 'awaiting-answer', 'feedback']) {
      expect(description).toContain(status)
    }
    expect(description).toContain('inference never overwrites a manual mark')
    expect(description).toContain('Do not mark a normally finished session done automatically')
  })

  it('rejects a note longer than maxNoteLength', async () => {
    const { tools } = await bootService()
    const tool = tools.find((t) => t.name === 'set_session_status')
    await expect(tool.execute({ status: 'todo', note: 'x'.repeat(50) }, { agent: { id: 's' } }))
      .rejects.toThrow(/maxNoteLength/)
  })
})

describe('SessionStatusService auto inference', () => {
  it('observes a turn/end interrupted event and writes an auto mark', async () => {
    const { svc, listeners } = await bootService(true)
    expect(listeners.length).toBe(1)
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 4, time: 123, data: { reason: { kind: 'interrupted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')).toMatchObject({ status: 'stopped', source: 'auto', autoReason: 'turn-interrupted' })
  })

  it('does not override a manual mark', async () => {
    const { svc, listeners } = await bootService(true)
    await svc.putMark(svc.explicitRow('s9', 'done', null, null))
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 4, time: 123, data: { reason: { kind: 'interrupted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')?.status).toBe('done')
  })
})

describe('SessionStatusService client config injection', () => {
  it('injects configured slot orders as a page global', async () => {
    const { ctx, injections } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG, rowActionOrder: 410, menuItemOrder: 420 })
    await svc[Service.init]()
    expect(injections.length).toBe(1)
    const table = []
    injections[0](table, {})
    expect(table).toEqual([{ kind: 'global', name: '__DSH_SESSION_MARKER_CONFIG__', value: { rowActionOrder: 410, menuItemOrder: 420 } }])
  })

  it('falls back to default orders when config omits them', async () => {
    const { ctx, injections } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG })
    await svc[Service.init]()
    const table = []
    injections[0](table, {})
    expect(table[0].value).toEqual({ rowActionOrder: 300, menuItemOrder: 300 })
  })

  it('keeps session/event listeners separate from the injection listener', async () => {
    const { listeners, injections } = await bootService(true)
    expect(listeners.length).toBe(1)
    expect(injections.length).toBe(1)
  })
})
