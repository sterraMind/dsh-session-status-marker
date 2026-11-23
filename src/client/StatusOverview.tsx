/** @module Status-overview settings page (`settings.section`).
 *
 * One read-only page that groups every marked session by status, with a count
 * per group. It fetches `MARKER_OVERVIEW_ROUTE` on mount and polls on the
 * Host-configured cadence; the read pauses while the document is hidden and
 * refreshes immediately when the page becomes visible again (same pattern as
 * `marks.ts`). The `close` prop is the shell's only affordance for a section;
 * v1.1 does not act on it (no jump-to-session yet) but keeps it in the props so
 * the outlet contract stays satisfied.
 *
 * Resource guards on the polling loop (each targets a different failure mode):
 *  - Full Jitter backoff: while the Host is slow or down, every consecutive
 *    failure widens the retry window (`base * 2 ** failures`, capped at 60 s)
 *    and the next attempt is scheduled at a random point inside it (AWS
 *    Builders Library pattern). The board then probes a sick Host about once
 *    a minute instead of adding its own load to the overload, and the counter
 *    resets on any success (an `unchanged` answer counts as one).
 *  - Random initial offset + per-tick jitter: fixed-interval pollers start in
 *    phase and pile into one request wall; the offset before the first tick
 *    spreads clients that start together, and the ±25% jitter on every other
 *    tick lets loops that did align drift apart again.
 *  - `unchanged` short-circuit: when the Host answers `unchanged: true` for a
 *    `?since=<revision>` poll, the payload equals what is already on screen,
 *    so every setState is skipped and React re-renders only when something
 *    actually changed.
 */

import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './overview.module.css'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { STATUS_META } from '../contracts.js'
import type { OverviewResponse, StatusGroup, UnmarkedSessions } from '../contracts.js'

/**
 * `settings.section` is owned by the (not-installed-here) settings shell
 * package. Merge its SlotMap entry locally so `PropsRuntime<'settings.section'>`
 * resolves and the register site in index.ts sees a valid slot key. The owner
 * share is the shell's only section affordance: `close`.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.section': {
      kind: 'list';
      scope: 'root';
      owner: { readonly close: () => void };
    }
  }
}

/** Narrow document view; the Host build has no DOM lib. */
interface OverviewDocument {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

function currentDocument(): OverviewDocument | undefined {
  return (globalThis as { document?: OverviewDocument }).document
}

export type StatusOverviewInjected = {
  /** Section copy, bound to the active locale by the shell. */
  readonly t: (key: string, params?: Record<string, string>) => string
  /**
   * Fetch the Host overview route. `since` carries the last `revision` the
   * Host returned; when the board payload has not changed since then the Host
   * answers `unchanged: true` with a small payload, so steady-state polls cost
   * few bytes and no re-render. `undefined` (the first poll) requests a full
   * payload.
   */
  readonly fetchOverview: (since?: string) => Promise<OverviewResponse>
}

export type StatusOverviewProps = StatusOverviewInjected & PropsRuntime<'settings.section'>

/**
 * Full Jitter backoff delay (AWS Builders Library timeout/retry/backoff
 * pattern).
 *
 * The retry window grows exponentially with the consecutive-failure count —
 * `baseMs * 2 ** consecutiveFailures` — and is capped at `60_000` ms, so a
 * sick Host is probed at most about once per minute in steady state (the cap
 * alone is already circuit-breaker behaviour). The uniform draw anywhere in
 * the window (full jitter, as opposed to window plus a small offset) keeps
 * clients that fail in lock-step from all retrying in the same second.
 *
 * Pure and exported so the formula can be exercised directly from the test
 * suite without compiled `lib/` artifacts.
 */
export function overviewBackoffDelay(consecutiveFailures: number, baseMs: number): number {
  return Math.random() * Math.min(60_000, baseMs * 2 ** consecutiveFailures)
}

/** Format an epoch-ms timestamp for the row's "updated" line. */
function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function GroupBlock({ group, t }: { group: StatusGroup; t: StatusOverviewInjected['t'] }) {
  const meta = STATUS_META[group.status]
  return (
    <div className={css.group}>
      <div className={css.groupHead}>
        <span className={css.groupTitle} style={{ color: meta.tone }}>{t(meta.labelKey)}</span>
        <span className={css.count}>{t('overview.count', { count: String(group.count) })}</span>
      </div>
      <ul className={css.list}>
        {group.entries.map((entry) => (
          <li key={entry.sessionId} className={css.row}>
            <span className={css.rowTitle} title={entry.title ?? entry.sessionId}>
              {entry.title ?? t('overview.noTitle')}
            </span>
            <span className={css.rowMeta}>
              {entry.note ? entry.note.slice(0, 48) : ''}
              {entry.note ? ' · ' : ''}{t('overview.updatedAt', { time: formatTime(entry.updatedAtMs) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UnmarkedBlock({ unmarked, t }: { unmarked: UnmarkedSessions; t: StatusOverviewInjected['t'] }) {
  if (unmarked.count === 0) return null
  return (
    <div className={css.group}>
      <div className={css.groupHead}>
        <span className={css.groupTitle}>{t('overview.unmarked', { count: String(unmarked.count) })}</span>
      </div>
      <ul className={css.list}>
        {unmarked.entries.map((entry) => (
          <li key={entry.sessionId} className={css.row}>
            <span className={css.rowTitle} title={entry.title ?? entry.sessionId}>
              {entry.title ?? t('overview.noTitle')}
            </span>
            <span className={css.rowMeta}>
              {t('overview.updatedAt', { time: formatTime(entry.updatedAtMs) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StatusOverview(props: StatusOverviewProps) {
  const { t, fetchOverview } = props
  const [groups, setGroups] = useState<readonly StatusGroup[]>([])
  const [unmarked, setUnmarked] = useState<UnmarkedSessions>({ count: 0, entries: [] })
  const [totalMarked, setTotalMarked] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // One mount: fetch immediately, then poll; pause while hidden, refresh on visible.
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // The Host-configured cadence is unknown until the first response; start
    // from the safe default and follow `refreshIntervalMs` once any response
    // (full or unchanged) carries it.
    let intervalMs = 2000
    // True once the first response set the cadence; until then the first tick
    // waits a random offset (see nextDelay) so boards that mount together do
    // not poll in phase.
    let settled = false
    // Consecutive failed loads: drives the Full Jitter backoff window and is
    // reset to zero by any success (an `unchanged` answer counts as one).
    let consecutiveFailures = 0
    // `revision` from the last full response, sent back as `?since=` so the
    // Host can answer `unchanged` when the board did not change. Stays
    // `undefined` (and is never sent) when the Host omits the field.
    let lastRevision: string | undefined = undefined
    let inFlight = false

    /**
     * Delay until the next tick. While failures accumulate, the Full Jitter
     * backoff window (capped at 60 s) dominates so a sick Host gets quieter
     * and quieter probes; after any success the loop returns to the normal
     * cadence with ±25% jitter per tick, which prevents the loops of several
     * boards from re-aligning into a request wall. Before the first tick an
     * extra offset of up to one interval staggers boards that opened together.
     */
    function nextDelay(): number {
      if (consecutiveFailures > 0) return overviewBackoffDelay(consecutiveFailures, intervalMs)
      if (!settled) return intervalMs + intervalMs * Math.random()
      return intervalMs * (1 + (Math.random() - 0.5) * 0.5)
    }

    async function load(): Promise<void> {
      // Never stack a second request over an unfinished one. A hung Host used
      // to accumulate a fetch every 2 s while the first never settled; the
      // deadline in fetchOverview fails that request, then the next tick retries.
      if (inFlight) return
      inFlight = true
      try {
        const data = await fetchOverview(lastRevision)
        if (disposed) return
        // Any successful response means the Host is reachable again: collapse
        // the retry window back to the normal cadence.
        consecutiveFailures = 0
        if (typeof data.refreshIntervalMs === 'number' && data.refreshIntervalMs >= 250) {
          intervalMs = data.refreshIntervalMs
        }
        settled = true
        // `unchanged`: the Host says the board payload is identical to what is
        // already rendered, so touching any state would only re-render React
        // and allocate a fresh object graph every tick for zero visual change.
        // Only the cadence follows the Host here.
        if (data.unchanged === true) return
        // Remember the revision for the next `?since=` poll; `undefined` (Host
        // older than the conditional-refresh contract) is tolerated and simply
        // never sent.
        lastRevision = data.revision
        setGroups(data.groups)
        setTotalMarked(data.totalMarked)
        setUnmarked(data.unmarked ?? { count: 0, entries: [] })
        setError(false)
      } catch {
        // A failed load widens the next tick's retry window (Full Jitter, see
        // overviewBackoffDelay): the longer the Host stays sick, the quieter
        // this board gets, buying the Host a recovery window instead of being
        // probed every 2 s. The error state keeps showing meanwhile.
        consecutiveFailures += 1
        if (!disposed) setError(true)
      } finally {
        inFlight = false
        if (!disposed) setLoading(false)
      }
    }

    function tick(): void {
      timer = null
      const doc = currentDocument()
      if (doc === undefined || !doc.hidden) void load()
      timer = setTimeout(tick, nextDelay())
    }

    function onVisible(): void {
      const doc = currentDocument()
      if (doc !== undefined && !doc.hidden) void load()
    }

    void load()
    timer = setTimeout(tick, nextDelay())
    const doc = currentDocument()
    if (doc !== undefined) doc.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      if (doc !== undefined) doc.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchOverview])

  /** Stop events bubbling to the settings panel's interactive chrome. */
  function stop(event: SyntheticEvent) {
    event.stopPropagation()
  }
  const guard = { onClick: stop, onKeyDown: stop }

  if (loading) {
    return <div className={css.page} {...guard}><div className={css.loading}>{t('hover.loading')}</div></div>
  }
  if (error) {
    return <div className={css.page} {...guard}><div className={css.loading}>{t('hover.error')}</div></div>
  }
  if (totalMarked === 0 && unmarked.count === 0) {
    return <div className={css.page} {...guard}><div className={css.empty}>{t('overview.empty')}</div></div>
  }
  return (
    <div className={css.page} {...guard}>
      <div className={css.title}>{t('overview.title')}</div>
      {groups.map((group) => <GroupBlock key={group.status} group={group} t={t} />)}
      <UnmarkedBlock unmarked={unmarked} t={t} />
    </div>
  )
}
