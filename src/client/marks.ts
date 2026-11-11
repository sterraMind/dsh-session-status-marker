/** @module Browser-side mark cache and change fan-out.
 *
 * The Host cannot push a change to the browser: `domain/changed` is in-process
 * only (`docs/subsystems/storage.md:170`), and an out-of-tree bundle cannot
 * register a Typert Remote stream (that needs build artifacts from the main
 * repository). This module therefore keeps one shared read of
 * `MARKER_LIST_ROUTE` on a timer, fans the result out to every subscribed
 * component, and accepts local write-through after the component's own
 * mutation so the row badge updates the instant a cell is clicked.
 *
 * One timer serves the whole page regardless of how many sessions are listed;
 * it pauses while the document is hidden and refreshes immediately when the
 * page becomes visible again.
 */

import { MARKER_LIST_ROUTE, DEFAULT_REFRESH_INTERVAL_MS } from '../contracts.js'
import type { AllMarksResponse, MarkRecord } from '../contracts.js'

/** Receives the newest known mark for one session (`null` means no mark). */
export type MarkListener = (mark: MarkRecord | null) => void

const listeners = new Map<string, Set<MarkListener>>()
const cache = new Map<string, MarkRecord | null>()
let intervalMs = DEFAULT_REFRESH_INTERVAL_MS
let timer: ReturnType<typeof setTimeout> | null = null
let started = false
let inFlight = false

/** Narrow view of the browser document; the Host build has no DOM lib. */
interface VisibilityDocument {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

function currentDocument(): VisibilityDocument | undefined {
  return (globalThis as { document?: VisibilityDocument }).document
}

/** Deliver one mark to every component watching that session. */
function publish(sessionId: string, mark: MarkRecord | null): void {
  cache.set(sessionId, mark)
  const set = listeners.get(sessionId)
  if (set === undefined) return
  for (const listener of set) listener(mark)
}

/**
 * Read every mark once and publish the differences.
 *
 * A session that is subscribed but absent from the response publishes `null`,
 * so a cleared or expired mark disappears from the badge without a reload.
 * Failures keep the previous snapshot and leave the next tick to retry.
 */
export async function refreshMarksOnce(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const resp = await fetch(MARKER_LIST_ROUTE)
    if (!resp.ok) return
    const data = (await resp.json()) as AllMarksResponse
    if (typeof data.refreshIntervalMs === 'number' && data.refreshIntervalMs >= 250) {
      intervalMs = data.refreshIntervalMs
    }
    const seen = new Set<string>()
    for (const row of data.marks) {
      seen.add(row.sessionId)
      publish(row.sessionId, row)
    }
    const watched = new Set<string>([...cache.keys(), ...listeners.keys()])
    for (const sessionId of watched) {
      if (!seen.has(sessionId)) publish(sessionId, null)
    }
  } catch {
    // Keep the last known snapshot; the next tick retries.
  } finally {
    inFlight = false
  }
}

/** Re-arm the shared read loop after each attempt so the interval follows the Host. */
function tick(): void {
  timer = null
  if (!started) return
  const doc = currentDocument()
  if (doc === undefined || !doc.hidden) void refreshMarksOnce()
  timer = setTimeout(tick, intervalMs)
}

/** Refresh as soon as a hidden tab becomes visible again. */
function onVisibilityChange(): void {
  const doc = currentDocument()
  if (doc !== undefined && !doc.hidden) void refreshMarksOnce()
}

/**
 * Subscribe one component to a session's mark.
 * @param sessionId - Session whose badge or hover card is on screen.
 * @param listener - Called with the newest mark whenever it changes.
 * @returns Unsubscribe function; the shared loop stops with its last listener.
 */
export function subscribeMarks(sessionId: string, listener: MarkListener): () => void {
  let set = listeners.get(sessionId)
  if (set === undefined) {
    set = new Set()
    listeners.set(sessionId, set)
  }
  set.add(listener)

  if (!started) {
    started = true
    void refreshMarksOnce()
    timer = setTimeout(tick, intervalMs)
    const doc = currentDocument()
    if (doc !== undefined) doc.addEventListener('visibilitychange', onVisibilityChange)
  } else if (cache.has(sessionId)) {
    listener(cache.get(sessionId) ?? null)
  }

  return () => {
    const current = listeners.get(sessionId)
    if (current !== undefined) {
      current.delete(listener)
      if (current.size === 0) listeners.delete(sessionId)
    }
    if (listeners.size === 0 && started) {
      started = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      const doc = currentDocument()
      if (doc !== undefined) doc.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

/** Write-through after a local mutation, so every open component updates at once. */
export function publishLocalMark(sessionId: string, mark: MarkRecord | null): void {
  publish(sessionId, mark)
}

/** Last-known mark from the shared cache, or `null` when none was read yet. */
export function cachedMark(sessionId: string): MarkRecord | null {
  return cache.get(sessionId) ?? null
}

/** Whether the shared cache already holds an answer for this session. */
export function hasCachedMark(sessionId: string): boolean {
  return cache.has(sessionId)
}

/** Test hook: drop every subscriber, cache entry, and timer. */
export function resetMarksForTest(): void {
  listeners.clear()
  cache.clear()
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  started = false
  inFlight = false
}
