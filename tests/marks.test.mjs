import { describe, it, beforeEach, afterEach } from 'node:test'
import { expect } from './expect.mjs'
import {
  subscribeMarks,
  publishLocalMark,
  cachedMark,
  hasCachedMark,
  refreshMarksOnce,
  resetMarksForTest,
} from '../lib/client/marks.js'
import { MARKER_LIST_ROUTE } from '../lib/contracts.js'

const originalFetch = globalThis.fetch
const originalDocument = globalThis.document
let fetchCalls = []

function mark(sessionId, status) {
  return { version: 1, insertedAtMs: 1, seq: 0, sessionId, status, source: 'manual', subjectId: null, autoReason: null, note: null }
}

function stubList(rows, refreshIntervalMs = 2000, options = {}) {
  const revision = options.revision ?? 'rev-default'
  const unchanged = options.unchanged === true
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url))
    return { ok: true, json: async () => ({ marks: unchanged ? [] : rows, refreshIntervalMs, revision, unchanged }) }
  }
}

beforeEach(() => {
  resetMarksForTest()
  fetchCalls = []
})

afterEach(() => {
  resetMarksForTest()
  globalThis.fetch = originalFetch
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
})

describe('shared mark cache', () => {
  it('publishes the host snapshot to every subscriber of that session', async () => {
    stubList([mark('s1', 'todo')])
    const seenA = []
    const seenB = []
    const offA = subscribeMarks('s1', (m) => seenA.push(m))
    const offB = subscribeMarks('s1', (m) => seenB.push(m))
    await new Promise((resolve) => setImmediate(resolve))
    expect(cachedMark('s1')?.status).toBe('todo')
    expect(hasCachedMark('s1')).toBe(true)
    expect(seenA.at(-1)?.status).toBe('todo')
    expect(seenB.at(-1)?.status).toBe('todo')
    offA()
    offB()
  })

  it('accepts a local write-through without waiting for the next read', () => {
    stubList([])
    const seen = []
    const off = subscribeMarks('s2', (m) => seen.push(m))
    publishLocalMark('s2', mark('s2', 'done'))
    expect(seen.at(-1)?.status).toBe('done')
    expect(cachedMark('s2')?.status).toBe('done')
    off()
  })

  it('publishes null for a watched session that dropped out of the snapshot', async () => {
    stubList([mark('s3', 'review')])
    const seen = []
    const off = subscribeMarks('s3', (m) => seen.push(m))
    await new Promise((resolve) => setImmediate(resolve))
    expect(seen.at(-1)?.status).toBe('review')
    stubList([])
    await refreshMarksOnce()
    expect(seen.at(-1)).toBeNull()
    expect(cachedMark('s3')).toBeNull()
    off()
  })

  it('adopts the refresh cadence reported by the host', async () => {
    stubList([mark('s4', 'done')], 5000)
    await refreshMarksOnce()
    const delays = []
    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn, delay) => { delays.push(delay); return realSetTimeout(fn, 60000) }
    try {
      const off = subscribeMarks('s4', () => {})
      off()
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
    expect(delays).toContain(5000)
  })

  it('keeps the previous snapshot when the read fails', async () => {
    globalThis.fetch = async () => { throw new Error('offline') }
    publishLocalMark('s5', mark('s5', 'blocked'))
    await refreshMarksOnce()
    expect(cachedMark('s5')?.status).toBe('blocked')
  })

  it('sends the last revision as ?since and skips publish when the host says unchanged', async () => {
    stubList([mark('s6', 'todo')], 2000, { revision: 'rev-6' })
    const seen = []
    const off = subscribeMarks('s6', (m) => seen.push(m))
    await new Promise((resolve) => setImmediate(resolve))
    expect(fetchCalls[0]).toBe(MARKER_LIST_ROUTE)
    expect(seen).toHaveLength(1)
    const before = cachedMark('s6')

    stubList([], 2000, { revision: 'rev-6', unchanged: true })
    await refreshMarksOnce()
    expect(fetchCalls.at(-1)).toBe(`${MARKER_LIST_ROUTE}?since=rev-6`)
    expect(seen).toHaveLength(1)
    expect(cachedMark('s6')).toBe(before)
    off()
  })

  it('keeps the last revision after a failed read', async () => {
    stubList([mark('s7', 'done')], 2000, { revision: 'rev-7' })
    await refreshMarksOnce()
    globalThis.fetch = async () => { throw new Error('offline') }
    await refreshMarksOnce()
    stubList([], 2000, { revision: 'rev-7', unchanged: true })
    await refreshMarksOnce()
    expect(fetchCalls.at(-1)).toBe(`${MARKER_LIST_ROUTE}?since=rev-7`)
  })

  it('seeds a session first subscribed after the loop started with a full read', async () => {
    stubList([mark('s9', 'todo')], 2000, { revision: 'rev-9' })
    const offA = subscribeMarks('s9', () => {})
    await new Promise((resolve) => setImmediate(resolve))
    expect(fetchCalls[0]).toBe(MARKER_LIST_ROUTE)

    // Loop is already running with a known revision. A brand-new session id
    // has no cached answer, so it must trigger a full (no ?since) read rather
    // than wait for a change that may never arrive.
    stubList([mark('s10', 'blocked')], 2000, { revision: 'rev-9' })
    const seenB = []
    const offB = subscribeMarks('s10', (m) => seenB.push(m))
    await new Promise((resolve) => setImmediate(resolve))
    expect(fetchCalls.at(-1)).toBe(MARKER_LIST_ROUTE)
    expect(seenB).toHaveLength(1)
    expect(seenB[0]?.status).toBe('blocked')
    offA(); offB()
  })

  it('forces a full read when a hidden tab becomes visible', async () => {
    let onVisible
    globalThis.document = {
      hidden: true,
      addEventListener: (type, fn) => { if (type === 'visibilitychange') onVisible = fn },
      removeEventListener: () => {},
    }
    stubList([mark('s8', 'review')], 2000, { revision: 'rev-8' })
    const off = subscribeMarks('s8', () => {})
    await new Promise((resolve) => setImmediate(resolve))
    expect(fetchCalls[0]).toBe(MARKER_LIST_ROUTE)

    globalThis.document.hidden = false
    stubList([mark('s8', 'review')], 2000, { revision: 'rev-8' })
    onVisible()
    await new Promise((resolve) => setImmediate(resolve))
    expect(fetchCalls.at(-1)).toBe(MARKER_LIST_ROUTE)
    off()
  })
})
