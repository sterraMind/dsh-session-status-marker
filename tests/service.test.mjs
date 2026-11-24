/** Integration-style unit tests for the host service using a fake Cordis context.
 *
 * We never boot a real session log; instead we stub the three surfaces the
 * service depends on — `storageDomain.open`, `connection.fetch.register`,
 * `tools.register` — so the storage/route/tool wiring can be exercised directly.
 */

import { describe, it, expect, beforeEach } from './vitest-shim.mjs'
import { Service } from '@deepseek-ai/cordis'
import { SessionStatusService, Config } from '../lib/service.js'

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
    expect(second).toMatchObject({ marks: [], unchanged: true, refreshIntervalMs: 2000 })
    // The caller already holds this revision, so it is not echoed back.
    expect('revision' in second).toBe(false)
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

describe('SessionStatusService observation layer', () => {
  it('keeps the explicit mark while recording what the system saw', async () => {
    const { svc, listeners } = await bootService(true)
    await svc.putMark(svc.explicitRow('s9', 'done', null, null))
    await listeners[0]({ id: 's9' }, { type: 'turn/start', seq: 1, time: 100, data: {} })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')).toMatchObject({
      status: 'done',
      observedStatus: 'todo',
      observedEvent: 'turn/start',
      observedAtMs: 100,
    })
  })

  it('serializes two events for the same session so the later state wins', async () => {
    const { ctx, listeners } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG, autoInfer: true, autoFallback: true })
    await svc[Service.init]()
    // Both handlers run their automatic layers without awaiting each other; the
    // per-session chain is what keeps the second event from being overtaken by
    // the first one's writes.
    await listeners[0]({ id: 's9' }, { type: 'turn/start', seq: 1, time: 100, data: {} })
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 2, time: 200, data: { reason: { kind: 'aborted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')?.status).toBe('stopped')
  })

  it('changes the list revision when only the observation changes', async () => {
    const { svc, routes } = await bootService()
    const row = svc.explicitRow('s1', 'done', null, null)
    await svc.putMark(row)
    const list = routes.find((r) => r.path.endsWith('.list'))
    const first = await (await list.fetch(new Request('http://x/api/session-status-marker.list'))).json()
    await svc.putMark({ ...row, observedStatus: 'todo', observedEvent: 'turn/start', observedAtMs: 100 })
    const second = await (await list.fetch(new Request('http://x/api/session-status-marker.list'))).json()
    expect(second.revision).not.toBe(first.revision)
  })

  it('mutate set responds with the stored observation instead of clearing it', async () => {
    const { svc, routes } = await bootService()
    const row = svc.explicitRow('s1', 'done', null, null)
    await svc.putMark({ ...row, observedStatus: 'todo', observedEvent: 'turn/start', observedAtMs: 100 })
    const mutate = routes.find((r) => r.path.endsWith('.mutate'))
    const res = await mutate.fetch(new Request('http://x/api/session-status-marker.mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', sessionId: 's1', status: 'review', source: 'manual', note: null, subjectId: null }),
    }))
    const body = await res.json()
    expect(body.mark).toMatchObject({ status: 'review', observedStatus: 'todo', observedAtMs: 100 })
  })

  it('hides an automatic mark past autoExpireMs from list and overview', async () => {
    const { ctx, routes } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG, autoExpireMs: 1000 })
    await svc[Service.init]()
    const autoRow = (sessionId, insertedAtMs) => ({
      version: 1, insertedAtMs, seq: 0, sessionId, status: 'feedback', source: 'auto',
      subjectId: null, autoReason: 'fallback-feedback', note: null,
      observedStatus: null, observedEvent: null, observedAtMs: null,
    })
    await svc.putMark(autoRow('expired', Date.now() - 60_000))
    await svc.putMark(autoRow('fresh', Date.now()))

    const list = await (await routes.find((r) => r.path.endsWith('.list'))
      .fetch(new Request('http://x/api/session-status-marker.list'))).json()
    expect(list.marks.map((row) => row.sessionId)).toEqual(['fresh'])

    // An explicit mark never expires: the same age on a manual row must survive.
    await svc.putMark({
      version: 1, insertedAtMs: Date.now() - 60_000, seq: 0, sessionId: 'manual', status: 'done', source: 'manual',
      subjectId: null, autoReason: null, note: null,
      observedStatus: null, observedEvent: null, observedAtMs: null,
    })
    const afterManual = await (await routes.find((r) => r.path.endsWith('.list'))
      .fetch(new Request('http://x/api/session-status-marker.list'))).json()
    expect(afterManual.marks.map((row) => row.sessionId).sort()).toEqual(['fresh', 'manual'])
  })

  it('defaults autoExpireMs to one day when the config omits it', async () => {
    const { ctx, injections } = makeCtx()
    const svc = new SessionStatusService(ctx, Config({ autoInfer: false, maxNoteLength: 20 }))
    await svc[Service.init]()
    const table = []
    injections[0](table, {})
    expect(table[0].value.effective.autoExpireMs).toBe(86_400_000)
  })
})

describe('SessionStatusService tools', () => {
  it('registers set_session_status and clear_session_status', async () => {
    const { tools } = await bootService()
    const names = tools.map((t) => t.name)
    expect(names).toContain('set_session_status')
    expect(names).toContain('clear_session_status')
  })

  it('set_session_status records an agent-sourced mark for the agent session', async () => {
    const { svc, tools } = await bootService()
    const tool = tools.find((t) => t.name === 'set_session_status')
    const result = await tool.execute({ status: 'stopped', note: 'boom' }, { agent: { id: 'session-7' } })
    expect(result).toMatchObject({ ok: true, sessionId: 'session-7', status: 'stopped', source: 'agent' })
    expect(svc.getMark('session-7')?.source).toBe('agent')
  })

  it('set_session_status lists all eight statuses and the override rules', async () => {
    const { tools } = await bootService()
    const description = tools.find((t) => t.name === 'set_session_status').description
    for (const status of ['todo', 'done', 'stopped', 'blocked', 'review', 'pending-subagent', 'awaiting-answer', 'feedback']) {
      expect(description).toContain(status)
    }
    expect(description).toContain('Automatic inference never overwrites a mark you set with this tool')
    expect(description).toContain('recorded with source agent')
    expect(description).toContain('Do not mark a session done merely because a reply finished')
    expect(description).toContain('mark it feedback so the session list shows work is waiting on them')
  })

  it('rejects a note longer than maxNoteLength', async () => {
    const { tools } = await bootService()
    const tool = tools.find((t) => t.name === 'set_session_status')
    await expect(tool.execute({ status: 'todo', note: 'x'.repeat(50) }, { agent: { id: 's' } }))
      .rejects.toThrow(/maxNoteLength/)
  })
})

describe('SessionStatusService auto inference', () => {
  it('observes a turn/end aborted event and writes an auto mark', async () => {
    const { svc, listeners } = await bootService(true)
    expect(listeners.length).toBe(1)
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 4, time: 123, data: { reason: { kind: 'aborted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')).toMatchObject({ status: 'stopped', source: 'auto', autoReason: 'turn-interrupted' })
  })

  it('leaves a crash-recovery turn/end interrupted unmarked', async () => {
    const { svc, listeners } = await bootService(true)
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 4, time: 123, data: { reason: { kind: 'interrupted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')).toBeNull()
  })

  it('does not override a manual mark', async () => {
    const { svc, listeners } = await bootService(true)
    await svc.putMark(svc.explicitRow('s9', 'done', null, null))
    await listeners[0]({ id: 's9' }, { type: 'turn/end', seq: 4, time: 123, data: { reason: { kind: 'aborted' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.getMark('s9')?.status).toBe('done')
  })
})

describe('SessionStatusService client config injection', () => {
  it('injects the effective configuration as a page global', async () => {
    const { ctx, injections } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG, rowActionOrder: 410, menuItemOrder: 420 })
    await svc[Service.init]()
    expect(injections.length).toBe(1)
    const table = []
    injections[0](table, {})
    const value = table[0].value
    // Top-level slot orders stay for older bundles that read them directly.
    expect(value.rowActionOrder).toBe(410)
    expect(value.menuItemOrder).toBe(420)
    expect(value.effective).toEqual({
      rowActionOrder: 410,
      menuItemOrder: 420,
      autoInfer: false,
      autoFallback: false,
      turnEndAwaitingAnswer: false,
      maxNoteLength: 20,
      autoExpireMs: 0,
      refreshIntervalMs: 2000,
      observationTtlMs: 300_000,
    })
  })

  it('fills default orders and optional values when config omits them', async () => {
    const { ctx, injections } = makeCtx()
    const svc = new SessionStatusService(ctx, { ...CONFIG })
    await svc[Service.init]()
    const table = []
    injections[0](table, {})
    expect(table[0].value.rowActionOrder).toBe(300)
    expect(table[0].value.menuItemOrder).toBe(300)
    expect(table[0].value.effective.rowActionOrder).toBe(300)
    expect(table[0].value.effective.observationTtlMs).toBe(300_000)
  })

  it('keeps session/event listeners separate from the injection listener', async () => {
    const { listeners, injections } = await bootService(true)
    expect(listeners.length).toBe(1)
    expect(injections.length).toBe(1)
  })
})
