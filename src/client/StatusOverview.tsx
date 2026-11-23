/** @module Status-overview settings page (`settings.section`).
 *
 * One read-only page that groups every marked session by status, with a count
 * per group. It fetches `MARKER_OVERVIEW_ROUTE` on mount and polls on the
 * Host-configured cadence; the read pauses while the document is hidden and
 * refreshes immediately when the page becomes visible again (same pattern as
 * `marks.ts`). The `close` prop is the shell's only affordance for a section;
 * v1.1 does not act on it (no jump-to-session yet) but keeps it in the props so
 * the outlet contract stays satisfied.
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
  /** Fetch the Host overview route. */
  readonly fetchOverview: () => Promise<OverviewResponse>
}

export type StatusOverviewProps = StatusOverviewInjected & PropsRuntime<'settings.section'>

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
    let intervalMs = 2000
    let inFlight = false

    async function load(): Promise<void> {
      // Never stack a second request over an unfinished one. A hung Host used
      // to accumulate a fetch every 2 s while the first never settled; the
      // deadline in fetchOverview fails that request, then the next tick retries.
      if (inFlight) return
      inFlight = true
      try {
        const data = await fetchOverview()
        if (disposed) return
        if (typeof data.refreshIntervalMs === 'number' && data.refreshIntervalMs >= 250) {
          intervalMs = data.refreshIntervalMs
        }
        setGroups(data.groups)
        setTotalMarked(data.totalMarked)
        setUnmarked(data.unmarked ?? { count: 0, entries: [] })
        setError(false)
      } catch {
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
      timer = setTimeout(tick, intervalMs)
    }

    function onVisible(): void {
      const doc = currentDocument()
      if (doc !== undefined && !doc.hidden) void load()
    }

    void load()
    timer = setTimeout(tick, intervalMs)
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
