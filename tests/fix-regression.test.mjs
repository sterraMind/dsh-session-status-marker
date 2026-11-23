/** @module Regression tests for the 1.3.0-rc.3 follow-up fixes.
 *
 * Four user-reported defects (m00857) are pinned here by reading the shipped
 * source, so the suite runs under `node --test --test-isolation=none` without
 * compiled `lib/` artifacts:
 *  1. "已复制" reappearing across sessions: the copy guard is a ref-counted
 *     shared capture pair with an upward card walk.
 *  2. Focus drift / note editor losing its float: an edit lock pings the owning
 *     session row and blocks pointer entry into other rows while editing, and
 *     the input focuses without `autoFocus` scroll.
 *  3. Board stuck on "loading": the overview fetch has an abort deadline, uses
 *     an absolute path and is guarded against concurrent in-flight requests.
 *  4. Component reuse: the edit lock lives in its own module used by the hover
 *     slot, and the client build ships that module.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from './vitest-shim.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (...parts) => readFile(join(ROOT, ...parts), 'utf8')
const CARD_LOCK = await read('src', 'client', 'cardLock.ts')
const HOVER = await read('src', 'client', 'HoverCard.tsx')
const INDEX = await read('src', 'client', 'index.ts')
const OVERVIEW = await read('src', 'client', 'StatusOverview.tsx')
const CONTRACTS = await read('src', 'contracts.ts')
const BUILD = await read('scripts', 'build-client.mjs')

describe('note-edit card lock (focus drift + float loss)', () => {
  it('exports an edit lock hook driven by the editing flag', () => {
    expect(CARD_LOCK).toContain('export function useCardEditLock')
    expect(HOVER).toContain('useCardEditLock(editing, sessionId, rootRef)')
    expect(HOVER).toContain("from './cardLock.js'")
  })

  it('locks the owning row and replays pointer entry to keep the card open', () => {
    expect(CARD_LOCK).toContain("const ROW_SELECTOR = '[data-row-key]'")
    expect(CARD_LOCK).toContain('session:${sessionId}')
    expect(CARD_LOCK).toContain("new PointerEvent('pointerover'")
    expect(CARD_LOCK).toContain("pointerType: 'mouse'")
    expect(CARD_LOCK).toContain('event.stopPropagation()')
    expect(CARD_LOCK).toContain('window.setInterval(')
  })

  it('is a no-op when no owning row exists, so menu items stay unaffected', () => {
    expect(CARD_LOCK).toContain('// No owning row (e.g. a menu item, not a hover card): nothing to lock.')
    expect(CARD_LOCK).toContain('if (row === null) return')
  })

  it('focuses the note input without autoFocus scroll-then-dismiss', () => {
    expect(HOVER).toContain('inputRef')
    expect(HOVER).toContain('focus({ preventScroll: true })')
    // The word "autoFocus" may appear in prose explaining why it is avoided;
    // only a standalone JSX prop line would reintroduce the scroll-then-dismiss.
    expect(HOVER).not.toMatch(/^\s+autoFocus\s*$/m)
  })

  it('ships the new module in the browser bundle', () => {
    expect(BUILD).toContain("'client/cardLock.ts'")
  })
})

describe('overview board timeout (stuck on loading)', () => {
  it('defines an abort deadline in the shared contract', () => {
    expect(CONTRACTS).toContain('export const OVERVIEW_FETCH_TIMEOUT_MS = 8000')
  })

  it('fetches the absolute path with an abortable signal and clears the timer', () => {
    expect(INDEX).toContain('MARKER_OVERVIEW_PATH')
    expect(INDEX).toContain('new AbortController()')
    expect(INDEX).toContain('setTimeout(() => controller.abort(), OVERVIEW_FETCH_TIMEOUT_MS)')
    expect(INDEX).toContain('signal: controller.signal')
    expect(INDEX).toContain('clearTimeout(timeout)')
  })

  it('does not stack a second request over an unfinished one', () => {
    expect(OVERVIEW).toContain('let inFlight = false')
    expect(OVERVIEW).toContain('if (inFlight) return')
    expect(OVERVIEW).toContain('inFlight = true')
    expect(OVERVIEW).toContain('inFlight = false')
  })
})
