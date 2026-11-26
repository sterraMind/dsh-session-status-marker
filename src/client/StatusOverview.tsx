/** @module Session-status settings page (`settings.section`).
 *
 * One settings section with two tabs:
 *  - **Status overview** — every marked session grouped by status with a count
 *    per group, plus the sessions that carry no mark yet. Read-only.
 *  - **Plugin configuration** — the effective configuration the Browser half
 *    can see, keyed by the literal `cordis.patch.yml` names so a value can be
 *    looked up (and changed) in the profile without translating anything.
 *
 * Only the first tab fetches. It reads `MARKER_OVERVIEW_ROUTE` on mount and
 * polls on the Host-configured cadence; the read pauses while the document is
 * hidden and refreshes immediately when the page becomes visible again (same
 * pattern as `marks.ts`). Both panels stay mounted and are toggled with the
 * `hidden` attribute, so switching tabs neither restarts the poll loop nor
 * drops the `revision` the conditional refresh depends on. The `close` prop is
 * the shell's only affordance for a section; v1.1 does not act on it (no
 * jump-to-session yet) but keeps it in the props so the outlet contract stays
 * satisfied.
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

import { useEffect, useId, useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './overview.module.css'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { SegmentedTabs, type SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
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

/**
 * Configuration the Browser half resolves once at apply time.
 *
 * The Host injects these as a page global (`webserver/index-inject`), so the
 * configuration tab shows the values this client actually runs with instead of
 * defaults copied into the UI.
 */
export interface StatusOverviewConfig {
  /** Slot order of the row-action status button. */
  readonly rowActionOrder: number
  /** Slot order of the row-menu status item. */
  readonly menuItemOrder: number
  /**
   * Whether event-driven inference writes automatic marks. `null` when the
   * injected page global predates this field — the Host schema has no default
   * for it, so the page shows an em dash rather than inventing a value.
   */
  readonly autoInfer: boolean | null
  /** Whether the fallback net marks otherwise-blank sessions. */
  readonly autoFallback: boolean
  /** Whether a normally completed turn falls back to `awaiting-answer`. */
  readonly turnEndAwaitingAnswer: boolean
  /** Maximum note length the Host accepts, in characters. */
  readonly maxNoteLength: number
  /**
   * Age at which an automatic mark is discarded, in ms; `0` disables expiry.
   * `null` when the injected page global predates this field.
   */
  readonly autoExpireMs: number | null
  /** Browser re-read cadence for the mark list, in ms. */
  readonly refreshIntervalMs: number
  /** Age at which a system observation renders as outdated, in ms; `0` never. */
  readonly observationTtlMs: number
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
  /** Effective configuration, read from the Host-injected page global. */
  readonly config: StatusOverviewConfig
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
            {/* The right column always carries the update time, so a reader
              * can scan one column for "when". The note is a second line under
              * the title instead of sharing that column. */}
            <div className={css.rowMain}>
              <Tooltip label={entry.title ?? entry.sessionId} side="bottom" portal delayMs={400} onlyWhenClipped>
                <span className={css.rowTitle}>
                  {entry.title ?? t('overview.noTitle')}
                </span>
              </Tooltip>
              {entry.note ? <span className={css.rowNote}>{entry.note}</span> : null}
            </div>
            <span className={css.rowMeta}>
              {t('overview.updatedAt', { time: formatTime(entry.updatedAtMs) })}
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
            <div className={css.rowMain}>
              <Tooltip label={entry.title ?? entry.sessionId} side="bottom" portal delayMs={400} onlyWhenClipped>
                <span className={css.rowTitle}>
                  {entry.title ?? t('overview.noTitle')}
                </span>
              </Tooltip>
            </div>
            <span className={css.rowMeta}>
              {t('overview.updatedAt', { time: formatTime(entry.updatedAtMs) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type StatusBoardProps = {
  readonly t: StatusOverviewInjected['t']
  readonly fetchOverview: StatusOverviewInjected['fetchOverview']
}

/** Last successful board payload, kept across mounts of the section. */
interface BoardSnapshot {
  readonly groups: readonly StatusGroup[]
  readonly unmarked: UnmarkedSessions
  readonly totalMarked: number
  /** Revision of that payload, so the next mount can poll conditionally. */
  readonly revision: string | undefined
}

/**
 * Board payload of the last successful load.
 *
 * The settings shell renders only the active section
 * (`ui-settings-general` `SettingsRoot`: `renderSlot('settings.section', …,
 * { only: active })`), so navigating away and back unmounts this component and
 * a fresh instance starts with empty state. Before this cache existed every
 * remount showed "loading" until its own first response arrived; on a store
 * with hundreds of sessions that window is long enough to read as a board that
 * never loads. Keeping the last payload module-scoped lets a remount paint the
 * previous board immediately and refresh in the background, and lets the
 * `?since=` revision survive the remount.
 *
 * Deliberately not persisted (no localStorage): it is a paint cache for one
 * page session, and a stale board from a previous app run would be worse than
 * a short spinner.
 */
let cachedBoard: BoardSnapshot | undefined

/** Tab one: the read-only status board and its polling loop. */
function StatusBoard({ t, fetchOverview }: StatusBoardProps) {
  const [groups, setGroups] = useState<readonly StatusGroup[]>(() => cachedBoard?.groups ?? [])
  const [unmarked, setUnmarked] = useState<UnmarkedSessions>(() => cachedBoard?.unmarked ?? { count: 0, entries: [] })
  const [totalMarked, setTotalMarked] = useState(() => cachedBoard?.totalMarked ?? 0)
  // A remount that already has a payload paints it instead of a spinner: the
  // board only blocks on the first load of the whole page session.
  const [loading, setLoading] = useState(() => cachedBoard === undefined)
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
    let lastRevision: string | undefined = cachedBoard?.revision
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
        // The Host's cadence can differ from the default when a profile
        // overrides `refreshIntervalMs`; follow it from the first response on.
        if (typeof data.refreshIntervalMs === 'number' && data.refreshIntervalMs >= 250) {
          intervalMs = data.refreshIntervalMs
        }
        settled = true
        // `unchanged`: the Host says the board payload is identical to what is
        // already rendered, so touching any state would only re-render React
        // and allocate a fresh object graph every tick for zero visual change.
        if (data.unchanged === true) return
        // Remember the revision for the next `?since=` poll; `undefined` (Host
        // older than the conditional-refresh contract) is tolerated and simply
        // never sent.
        lastRevision = data.revision
        const nextUnmarked = data.unmarked ?? { count: 0, entries: [] }
        // The paint cache follows every payload that is actually rendered, so a
        // remount shows exactly the board the user last saw.
        cachedBoard = { groups: data.groups, unmarked: nextUnmarked, totalMarked: data.totalMarked, revision: data.revision }
        setGroups(data.groups)
        setTotalMarked(data.totalMarked)
        setUnmarked(nextUnmarked)
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

  // First load of the page session only: the tab strip and the config tab are
  // already usable, and the board area shows placeholder rows rather than one
  // centred "loading" line, so the section never reads as a blank page.
  if (loading) {
    return (
      <div className={css.board} aria-busy="true" aria-label={t('hover.loading')}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={css.skeletonRow} />
        ))}
      </div>
    )
  }
  const hasBoard = totalMarked > 0 || unmarked.count > 0
  // A failure with nothing painted yet is the only case that replaces the
  // board; with a cached payload the rows stay and the hint below reports it.
  if (error && !hasBoard) {
    return <div className={css.loading}>{t('hover.error')}</div>
  }
  return (
    <>
      {error ? <div className={css.stale}>{t('hover.error')}</div> : null}
      {!hasBoard ? <div className={css.empty}>{t('overview.empty')}</div> : null}
      {groups.map((group) => <GroupBlock key={group.status} group={group} t={t} />)}
      <UnmarkedBlock unmarked={unmarked} t={t} />
    </>
  )
}

/** One read-only row of the configuration list. */
interface ConfigRow {
  /**
   * Literal `cordis.patch.yml` key, shown verbatim: it is the string a user
   * pastes into the profile, so translating it would make the row unusable.
   */
  readonly key: string
  /** Formatted current value; `undefined` renders as an em dash. */
  readonly value: string | undefined
}

/**
 * Format a duration as `2000 ms (2 s)`.
 *
 * The raw millisecond count stays first because it is what
 * `cordis.patch.yml` takes; the seconds are the readable restatement. Values
 * below a whole second keep one decimal so a small interval does not read as
 * `0 s`.
 */
function formatMs(ms: number): string {
  const seconds = Math.round(ms / 100) / 10
  return `${ms} ms (${seconds} s)`
}

/** Format a flag with the localized On/Off word. */
function formatFlag(t: StatusOverviewInjected['t'], flag: boolean): string {
  return flag ? t('config.on') : t('config.off')
}

/**
 * Build the configuration rows in the Host contract's declaration order, so a
 * reader can compare this list against `ClientEffectiveConfig` one line at a
 * time.
 */
function configRows(config: StatusOverviewConfig, t: StatusOverviewInjected['t']): readonly ConfigRow[] {
  return [
    { key: 'rowActionOrder', value: String(config.rowActionOrder) },
    { key: 'menuItemOrder', value: String(config.menuItemOrder) },
    { key: 'autoInfer', value: config.autoInfer === null ? undefined : formatFlag(t, config.autoInfer) },
    { key: 'autoFallback', value: formatFlag(t, config.autoFallback) },
    { key: 'turnEndAwaitingAnswer', value: formatFlag(t, config.turnEndAwaitingAnswer) },
    { key: 'maxNoteLength', value: String(config.maxNoteLength) },
    { key: 'autoExpireMs', value: config.autoExpireMs === null ? undefined : formatMs(config.autoExpireMs) },
    { key: 'refreshIntervalMs', value: formatMs(config.refreshIntervalMs) },
    { key: 'observationTtlMs', value: formatMs(config.observationTtlMs) },
  ]
}

type ConfigPanelProps = {
  readonly t: StatusOverviewInjected['t']
  readonly config: StatusOverviewConfig
}

/** Tab two: the effective configuration, read-only. */
function ConfigPanel({ t, config }: ConfigPanelProps) {
  return (
    <div className={css.config}>
      <dl className={css.configList}>
        {configRows(config, t).map((row) => (
          <div key={row.key} className={css.configRow}>
            <dt className={css.configKey}>{row.key}</dt>
            <dd className={css.configValue}>{row.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <p className={css.configHint}>{t('config.hint')}</p>
    </div>
  )
}

/** The two pages of this section, in tab order. */
type TabId = 'overview' | 'config'

export function StatusOverview(props: StatusOverviewProps) {
  const { t, fetchOverview, config } = props
  // Default tab: the board, i.e. what the section showed before the tabs
  // existed. The configuration tab is the deliberate second stop.
  const [tab, setTab] = useState<TabId>('overview')
  const tabsId = useId()

  /** Stop events bubbling to the settings panel's interactive chrome. */
  function stop(event: SyntheticEvent) {
    event.stopPropagation()
  }
  const guard = { onClick: stop, onKeyDown: stop }

  // The host's own SegmentedTabs owns the roving tab stop, the arrow/Home/End
  // keys, and the sliding indicator; the panels below stay ours, matched by
  // `panelId`.
  const tabItems: [SegmentedTab<TabId>, ...SegmentedTab<TabId>[]] = [
    { value: 'overview', label: t('overview.nav'), id: `${tabsId}-overview`, panelId: `${tabsId}-overview-panel` },
    { value: 'config', label: t('config.tab'), id: `${tabsId}-config`, panelId: `${tabsId}-config-panel` },
  ]

  return (
    <div className={css.page} {...guard}>
      <div className={css.title}>{t('overview.title')}</div>
      <SegmentedTabs items={tabItems} value={tab} onChange={setTab} label={t('overview.nav')} />
      <div
        role="tabpanel"
        id={`${tabsId}-overview-panel`}
        aria-labelledby={`${tabsId}-overview`}
        className={tab === 'overview' ? css.panel : css.panelHidden}
        hidden={tab !== 'overview'}
      >
        <StatusBoard t={t} fetchOverview={fetchOverview} />
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-config-panel`}
        aria-labelledby={`${tabsId}-config`}
        className={tab === 'config' ? css.panel : css.panelHidden}
        hidden={tab !== 'config'}
      >
        <ConfigPanel t={t} config={config} />
      </div>
    </div>
  )
}
