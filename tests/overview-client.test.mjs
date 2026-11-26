/** @module Resource-guard tests for the overview board's client polling loop.
 *
 * Pins the three client-side protections added to `StatusOverview.tsx` and
 * `index.ts` so a sick or slow Host cannot be hammered by the board:
 *  1. Full Jitter exponential backoff on consecutive failures (window
 *     `base * 2 ** failures` capped at 60 s, reset on any success);
 *  2. a random offset before the first tick plus ±25% jitter per tick, so
 *     boards that start in phase drift apart instead of forming a request
 *     wall;
 *  3. the `unchanged` conditional-refresh path: the client sends its last
 *     `?since=` revision, and an `unchanged` answer skips every setState.
 *
 * The pre-existing guards are re-pinned here as well (in-flight lock,
 * visibility pause, 8 s fetch deadline) because the new scheduling rewrites
 * the same effect. Assertions read the source text directly, and the pure
 * backoff function is extracted and executed, so the suite runs under
 * `node --test --test-isolation=none` without compiled `lib/` artifacts.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from './vitest-shim.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (...parts) => readFile(join(ROOT, ...parts), 'utf8')
const OVERVIEW = await read('src', 'client', 'StatusOverview.tsx')
const OVERVIEW_CSS = await read('src', 'client', 'overview.module.css')
const INDEX = await read('src', 'client', 'index.ts')

/**
 * Pull the exported pure backoff function out of the TSX source and make it
 * executable: only the TypeScript type annotations are stripped, so the
 * numeric range of the formula can be asserted without compiled artifacts.
 */
function extractBackoffDelay() {
  const match = OVERVIEW.match(/export function overviewBackoffDelay\([\s\S]*?\n\}/)
  expect(match).toBeDefined()
  const js = match[0].replace('export function', 'function').replace(/: number/g, '')
  return new Function(`${js}\nreturn overviewBackoffDelay`)()
}

/** `{min, max}` of `n` draws of the extracted backoff function. */
function draw(backoffDelay, consecutiveFailures, baseMs, n) {
  const values = Array.from({ length: n }, () => backoffDelay(consecutiveFailures, baseMs))
  return { min: Math.min(...values), max: Math.max(...values) }
}

describe('overview polling resource guards (client)', () => {
  it('pins the Full Jitter backoff formula in the source', () => {
    expect(OVERVIEW).toContain('let consecutiveFailures = 0')
    expect(OVERVIEW).toContain('consecutiveFailures += 1')
    // The reset line (a success, including `unchanged`, collapses the window).
    expect(OVERVIEW).toMatch(/^\s+consecutiveFailures = 0$/m)
    expect(OVERVIEW).toContain('2 ** consecutiveFailures')
    expect(OVERVIEW).toMatch(/Math\.min\(60_000, /)
    expect(OVERVIEW).toContain('Math.random() *')
    // The backoff function is exported pure so this file can execute it.
    expect(OVERVIEW).toContain('export function overviewBackoffDelay')
  })

  it('draws the delay uniformly from [0, min(60000, base * 2^failures)]', () => {
    const backoffDelay = extractBackoffDelay()

    // failures = 0: the window is exactly base (2000 ms here).
    const zero = draw(backoffDelay, 0, 2000, 4000)
    expect(zero.min >= 0).toBe(true)
    expect(zero.max < 2000).toBe(true)

    // failures = 1: the window doubled to 4000 ms and is actually used.
    const one = draw(backoffDelay, 1, 2000, 4000)
    expect(one.max < 4000).toBe(true)
    expect(one.max > 3000).toBe(true)

    // failures = 4: base * 16 = 32000 ms, still below the 60 s cap.
    const four = draw(backoffDelay, 4, 2000, 4000)
    expect(four.max < 32000).toBe(true)
    expect(four.max > 24000).toBe(true)

    // failures = 10: base * 1024 would be far beyond the cap, so the 60 s
    // ceiling must hold, and full jitter must still reach near zero.
    const ten = draw(backoffDelay, 10, 2000, 4000)
    expect(ten.max <= 60000).toBe(true)
    expect(ten.max > 55000).toBe(true)
    expect(ten.min < 5000).toBe(true)
  })

  it('staggers the first tick and jitters the steady cadence by ±25%', () => {
    // Random initial offset of up to one interval before the first tick.
    expect(OVERVIEW).toContain('intervalMs + intervalMs * Math.random()')
    // Per-tick jitter: base * (1 + uniform(-0.25, 0.25)).
    expect(OVERVIEW).toContain('(1 + (Math.random() - 0.5) * 0.5)')
    // Both the mount schedule and every chained tick use the same policy.
    expect(OVERVIEW).toContain('timer = setTimeout(tick, nextDelay())')
  })

  it('keeps the pre-existing in-flight guard and visibility pause', () => {
    expect(OVERVIEW).toContain('let inFlight = false')
    expect(OVERVIEW).toContain('if (inFlight) return')
    expect(OVERVIEW).toContain('inFlight = true')
    expect(OVERVIEW).toContain('inFlight = false')
    // The read still pauses while hidden and refreshes when visible again.
    expect(OVERVIEW).toContain("doc.addEventListener('visibilitychange', onVisible)")
    expect(OVERVIEW).toContain("doc.removeEventListener('visibilitychange', onVisible)")
  })

  it('skips every setState on an unchanged answer but still tracks the cadence', () => {
    // The unchanged branch must return before any setState runs.
    expect(OVERVIEW).toMatch(/if \(data\.unchanged === true\) return/)
    // The revision travels back to the Host and is remembered for `?since=`.
    expect(OVERVIEW).toContain('lastRevision = data.revision')
    expect(OVERVIEW).toContain('fetchOverview(lastRevision)')
  })
})

describe('overview board remount cache (client)', () => {
  it('keeps the last painted payload in module scope, not per instance', () => {
    // The settings shell renders only the active section, so every visit to
    // "Session status" mounts a fresh StatusBoard. A module-scoped snapshot is
    // what lets that mount paint the previous board instead of a spinner.
    expect(OVERVIEW).toMatch(/^let cachedBoard: BoardSnapshot \| undefined$/m)
    expect(OVERVIEW).toContain('cachedBoard = { groups: data.groups, unmarked: nextUnmarked, totalMarked: data.totalMarked, revision: data.revision }')
  })

  it('seeds state from the snapshot so a remount starts painted', () => {
    expect(OVERVIEW).toContain('useState<readonly StatusGroup[]>(() => cachedBoard?.groups ?? [])')
    expect(OVERVIEW).toContain('useState(() => cachedBoard?.totalMarked ?? 0)')
    // Only the first load of the page session may block on a spinner.
    expect(OVERVIEW).toContain('useState(() => cachedBoard === undefined)')
    // The conditional-refresh revision survives the remount too.
    expect(OVERVIEW).toContain('let lastRevision: string | undefined = cachedBoard?.revision')
  })

  it('never collapses a painted board to a blank page', () => {
    // The board area shows placeholder rows on first load ...
    expect(OVERVIEW).toContain('css.skeletonRow')
    expect(OVERVIEW).toContain('aria-busy="true"')
    // ... and a refresh failure keeps the rows, reporting the failure above.
    expect(OVERVIEW).toContain('if (error && !hasBoard)')
    expect(OVERVIEW).toContain('css.stale')
  })
})

describe('overview conditional-refresh transport (client)', () => {
  it('appends ?since= only for a non-empty revision', () => {
    expect(INDEX).toContain('async (since?: string): Promise<OverviewResponse>')
    expect(INDEX).toContain('since === undefined || since === \'\'')
    expect(INDEX).toContain('?since=${encodeURIComponent(since)}')
    expect(INDEX).toContain('MARKER_OVERVIEW_PATH')
  })

  it('keeps the abort deadline and the absolute route path', () => {
    expect(INDEX).toContain('new AbortController()')
    expect(INDEX).toContain('setTimeout(() => controller.abort(), OVERVIEW_FETCH_TIMEOUT_MS)')
    expect(INDEX).toContain('signal: controller.signal')
    expect(INDEX).toContain('clearTimeout(timeout)')
  })
})

describe('overview tab strip (client)', () => {
  // The shell draws selection as a sliding indicator behind transparent tabs;
  // our old hand-drawn strip painted the selected tab itself, which read as a
  // hard-bordered square next to every other tab strip in the settings panel.
  it('renders the host SegmentedTabs instead of a local tablist', () => {
    expect(OVERVIEW).toContain('import { SegmentedTabs, type SegmentedTab } from \'@deepseek-ai/dsh-client-ui-primitives\'')
    expect(OVERVIEW).toContain('<SegmentedTabs items={tabItems} value={tab} onChange={setTab} label={t(\'overview.nav\')} />')
    expect(OVERVIEW).toContain('const tabItems: [SegmentedTab<TabId>, ...SegmentedTab<TabId>[]] = [')
    // The panels stay ours and keep matching the items' `panelId` values.
    expect(OVERVIEW).toContain('panelId: `${tabsId}-overview-panel`')
    expect(OVERVIEW).toContain('panelId: `${tabsId}-config-panel`')
    expect(OVERVIEW).toContain('id={`${tabsId}-overview-panel`}')
    expect(OVERVIEW).toContain('id={`${tabsId}-config-panel`}')
  })

  it('wires each panel to its own tab', () => {
    // The host tabs carry the `id` that labels a panel, so the panel's
    // `aria-labelledby` must be the id of the tab that opens it, and the
    // panel's `id` must be the `panelId` the tab points at.
    expect(OVERVIEW).toContain('aria-labelledby={`${tabsId}-overview`}')
    expect(OVERVIEW).toContain('aria-labelledby={`${tabsId}-config`}')
    expect(OVERVIEW).toContain('id: `${tabsId}-overview`, panelId: `${tabsId}-overview-panel`')
    expect(OVERVIEW).toContain('id: `${tabsId}-config`, panelId: `${tabsId}-config-panel`')
  })

  it('drops the self-drawn tablist, its keyboard handler, and its styles', () => {
    expect(OVERVIEW).not.toContain('role="tablist"')
    expect(OVERVIEW).not.toContain('onTabKeyDown')
    expect(OVERVIEW).not.toContain('css.tabList')
    expect(OVERVIEW).not.toContain('css.tabSelected')
    expect(OVERVIEW_CSS).not.toContain('.tabList')
    expect(OVERVIEW_CSS).not.toContain('.tabSelected')
    // No bare `.tab` rule may survive either: the bundle builder does not hash
    // selectors it cannot scope, so a leftover `.tab` would leak globally.
    expect(OVERVIEW_CSS).not.toMatch(/(?:^|\n)\.tab\s*[{:]/)
  })
})

describe('overview row meta (client)', () => {
  // Half the rows used to show a note summary where the other half showed a
  // date, because the note and the timestamp shared the right-hand column.
  it('always puts the update time in the right column', () => {
    const metaBlocks = OVERVIEW.match(/<span className=\{css\.rowMeta\}>[\s\S]*?<\/span>/g) ?? []
    expect(metaBlocks.length).toBe(2)
    for (const block of metaBlocks) {
      expect(block).toContain("t('overview.updatedAt', { time: formatTime(entry.updatedAtMs) })")
      expect(block).not.toContain('entry.note')
    }
  })

  it('renders the note as a second line under the title', () => {
    expect(OVERVIEW).toContain('{entry.note ? <span className={css.rowNote}>{entry.note}</span> : null}')
    // The note sits inside the same column as the title, above the meta line.
    expect(OVERVIEW).toMatch(/<div className=\{css\.rowMain\}>[\s\S]*?css\.rowNote[\s\S]*?<\/div>/)
    expect(OVERVIEW).not.toContain('entry.note.slice(0, 48)')
    // Both blocks share the column wrapper, so the rows line up across groups.
    expect((OVERVIEW.match(/className=\{css\.rowMain\}/g) ?? []).length).toBe(2)
  })

  it('styles the note as a single truncated secondary line', () => {
    const note = /(?:^|\n)\.rowNote\s*\{([^}]*)\}/.exec(OVERVIEW_CSS)
    expect(note !== null).toBe(true)
    expect(note[1]).toMatch(/font-size:\s*12px/)
    expect(note[1]).toMatch(/line-height:\s*18px/)
    expect(note[1]).toMatch(/color:\s*var\(--dsw-alias-label-secondary\)/)
    expect(note[1]).toMatch(/text-overflow:\s*ellipsis/)
    expect(note[1]).toMatch(/white-space:\s*nowrap/)
    // The title column must be able to shrink, or the note pushes the date out.
    const main = /(?:^|\n)\.rowMain\s*\{([^}]*)\}/.exec(OVERVIEW_CSS)
    expect(main !== null).toBe(true)
    expect(main[1]).toMatch(/min-width:\s*0/)
  })
})
