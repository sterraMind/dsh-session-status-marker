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

const originalFetch = globalThis.fetch

function mark(sessionId, status) {
  return { version: 1, insertedAtMs: 1, seq: 0, sessionId, status, source: 'manual', subjectId: null, autoReason: null, note: null }
}

function stubList(rows, refreshIntervalMs = 2000) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ marks: rows, refreshIntervalMs }) })
}

beforeEach(() => {
  resetMarksForTest()
})

afterEach(() => {
  resetMarksForTest()
  globalThis.fetch = originalFetch
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
})
