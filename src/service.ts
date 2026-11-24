/** @module Host-side service: durable marks, AI tools, inference listener, exact HTTP routes.
 *
 * Architecture (see `docs/architecture.md`): an out-of-tree bundle MUST NOT
 * declare custom `SessionEventMap` types — `Session.append` cannot emit
 * `ignorable: true`, so a persisted unknown required event makes the whole log
 * unreadable on resume/fork. Durable state therefore lives in `storageDomain`;
 * `session/event` is read-only observation; browser UI talks over exact
 * `ctx.connection.fetch` routes instead of Typert (which needs in-repo build
 * artifacts).
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pull the `sessions` Context merge so the overview route can join
// marks with session titles. `sessionTitle` is merged onto Context locally
// below (the `@deepseek-ai/dsh-session-title` package is not installed here).
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-client-connection'
import { MARKER_TABLE_NAME, MarkerDomainSpec, type MarkerDomain } from './domain.js'
import {
  STATUS_VALUES,
  MARK_VERSION,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_OBSERVATION_TTL_MS,
  DEFAULT_AUTO_EXPIRE_MS,
  DEFAULT_ROW_ACTION_ORDER,
  DEFAULT_MENU_ITEM_ORDER,
  CLIENT_CONFIG_GLOBAL,
  MARKER_STATE_PATH,
  MARKER_LIST_PATH,
  MARKER_MUTATE_PATH,
  MARKER_OVERVIEW_PATH,
  OVERVIEW_SERVICE_TIMEOUT_MS,
  OVERVIEW_REFRESH_WAIT_MS,
  TITLE_CACHE_TTL_MS,
  TITLE_ABSENT_TTL_MS,
  marksRevision,
  SetMarkBodySchema,
  ClearMarkBodySchema,
  type MarkRecord,
  type StatusEnum,
  type StatusGroup,
  type OverviewEntry,
  type ExplicitSource,
  OVERVIEW_CACHE_TTL_MS,
  OVERVIEW_CACHE_TTL_JITTER_MS,
  TITLE_CACHE_MAX_ENTRIES,
  overviewRevision,
} from './types.js'
import { DEFAULT_UNMARKED_LIMIT } from './contracts.js'
import type { ClientEffectiveConfig, UnmarkedEntry, UnmarkedSessions } from './contracts.js'
import {
  inferStatus,
  inferFallback,
  shouldApplyInference,
  shouldApplyFallback,
  isAutoMarkExpired,
  observationOf,
  shouldRecordObservation,
} from './inference.js'

/**
 * Deployment configuration. `autoInfer` and `maxNoteLength` are required and
 * fail at load when missing; the rest carry the defaults documented here.
 */
export interface Config {
  /** Enable read-only `session/event` inference of automatic marks. */
  autoInfer: boolean
  /** Maximum characters accepted in a note (tool arg and HTTP body). */
  maxNoteLength: number
  /**
   * Automatic marks older than this many ms are lazily discarded; `0` disables
   * expiry. Defaults to {@link DEFAULT_AUTO_EXPIRE_MS} (one day): automatic rows
   * are written by event inference and would otherwise keep a badge on every
   * session that ever ran a turn.
   */
  autoExpireMs: number
  /** Browser re-read cadence for the mark list, in ms; defaults to 2000. */
  refreshIntervalMs: number
  /** Order of the row-action status button; raise or lower to coexist with other plugins. */
  rowActionOrder: number
  /** Order of the row-menu status item; raise or lower to coexist with other plugins. */
  menuItemOrder: number
  /**
   * Fallback mark when a turn completes normally and neither the model nor an
   * earlier inference rule produced a mark for the session. Defaults to
   * `false` so existing installs keep their current behaviour.
   *
   * Interacts with {@link Config.autoFallback}: with the fallback net on (the
   * default), a normally-completed turn with no mark becomes `feedback` before
   * this layer runs, so this switch only decides the status when the fallback
   * net is off. The two are not alternatives — `feedback` and `awaiting-answer`
   * both mean "the turn ended and the user has not replied", and the fallback
   * net is the newer, subagent-aware owner of that transition.
   */
  turnEndAwaitingAnswer: boolean
  /**
   * Enable the fallback net, a layer separate from `autoInfer`. Where
   * `autoInfer` maps a *specific* event to a state, the fallback fires on the
   * *absence* of a mark: a running turn with no mark reads as `todo`, and a
   * normally-completed turn with no mark reads as `feedback` (or
   * `pending-subagent` when subagents are still running). It never touches an
   * explicit mark and never overwrites a mark the inference layer produced; the
   * one write it does make over an existing row is upgrading its own transient
   * `fallback-running` into a terminal state on the same turn's `turn/end`.
   * Defaults to `true` so a session is marked from its first running turn
   * instead of staying blank.
   */
  autoFallback: boolean
  /**
   * How long a system observation stays fresh, in ms. Past this the UI still
   * shows what was observed, demoted as outdated; `0` never goes stale.
   */
  observationTtlMs: number
}

/** Schemastery schema, consumed by Cordis when this row loads. */
export const Config = z.object({
  autoInfer: z.boolean().required(),
  maxNoteLength: z.natural().min(1).required(),
  autoExpireMs: z.natural().default(DEFAULT_AUTO_EXPIRE_MS),
  refreshIntervalMs: z.natural().min(250).default(DEFAULT_REFRESH_INTERVAL_MS),
  rowActionOrder: z.natural().default(DEFAULT_ROW_ACTION_ORDER),
  menuItemOrder: z.natural().default(DEFAULT_MENU_ITEM_ORDER),
  turnEndAwaitingAnswer: z.boolean().default(false),
  autoFallback: z.boolean().default(true),
  observationTtlMs: z.natural().default(DEFAULT_OBSERVATION_TTL_MS),
})

/**
 * Minimal shape of a `webserver/index-inject` global row. The authoritative
 * `IndexInjection` union lives in `@deepseek-ai/dsh-host-webserver`, which this
 * out-of-tree bundle does not depend on; only the `global` row is used here.
 */
interface IndexGlobalInjection {
  kind: 'global'
  name: string
  value: unknown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionStatusMarker: SessionStatusService
    /**
     * Session-title service (from `@deepseek-ai/dsh-session-title`, not
     * installed here). `get` returns the latest folded title snapshot for a
     * live session, or `undefined` before eligible input.
     */
    sessionTitle: { get(session: Session): { readonly title: string } | undefined }
    /**
     * Optional session-query engine (from `@deepseek-ai/dsh-session-query`, not
     * installed here). When the Host mounts it, `readTitleSnapshots` resolves
     * titles for sessions that are no longer loaded into memory, which is what
     * turns the board's "untitled" rows into real names. Declared optional and
     * read with `ctx.get` so a composition without it keeps working.
     */
    sessionQuery?: SessionQueryLike
    /**
     * Optional persistence service (from `@deepseek-ai/dsh-session-persistence`).
     * Its `list` returns a header for every session on disk, live or cold, which
     * lets the board enumerate and name sessions the Host has not loaded.
     */
    sessionPersistence?: SessionPersistenceLike
    /**
     * Optional projection cache (from `@deepseek-ai/dsh-session-projection-cache`).
     * `cachedSnapshot` answers folded projection values, including `title`, with
     * zero I/O, so cold sessions get a name even without the query engine.
     */
    sessionProjectionCache?: SessionProjectionCacheLike
  }
  interface Events {
    /** Collect structured index-injection rows for the rendered Web GUI page. */
    'webserver/index-inject'(table: IndexGlobalInjection[], peer: unknown): void
    /**
     * Realtime-only subagent lifecycle, emitted by the harness subagent seam
     * (`packages/subagent/subagent`). These are cordis runtime events, NOT
     * persisted `SessionEventMap` members, so declaring a structural slice for
     * them stays inside the out-of-tree red line: no custom `SessionEventMap`
     * type is declared and nothing is appended to a session log. The payload
     * shape mirrors the in-repo consumer (`hooks-claude-code/src/index.ts`).
     * These drive only the `pending-subagent` fallback, which is realtime-only
     * by design — after a restart the running count is `0`.
     */
    'subagent/start'(info: SubagentRunInfoLike): void
    'subagent/end'(info: SubagentRunEndInfoLike): void
  }
}

/** Structural slice of a `subagent/start` payload. */
interface SubagentRunInfoLike {
  readonly id: SessionId
  readonly runId: string
  readonly parentSessionId?: SessionId
}

/** Structural slice of a `subagent/end` payload. */
interface SubagentRunEndInfoLike extends SubagentRunInfoLike {
  readonly stopReason?: string
}

/** Structural slice of the Host's session-query engine that this plugin uses. */
interface SessionQueryLike {
  readTitleSnapshots(
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly TitleObservationResult[]>
}

/** One entry of {@link SessionQueryLike.readTitleSnapshots}. */
interface TitleObservationResult {
  readonly sessionId: string
  readonly status: 'fulfilled' | 'rejected'
  readonly value?: {
    readonly session: { readonly id: string }
    readonly title?: { readonly title: string }
  }
}

/** Structural slice of one session record returned by `listSessions`. */
interface SessionRecordLike {
  readonly header: { readonly id: SessionId; readonly createdAt?: number }
}

/**
 * Narrow an unknown cross-corpus list entry to a usable record.
 *
 * The Host's `listSessions` envelope has changed shape between DSH releases
 * (0.2.2-rc.3 returns a different record wrapper than the documented
 * `SessionRecord[]`), so the overview reads defensively: anything without a
 * string `header.id` is dropped instead of throwing out of the route handler.
 */
function isSessionRecord(value: unknown): value is SessionRecordLike {
  if (typeof value !== 'object' || value === null) return false
  const header: unknown = (value as { header?: unknown }).header
  if (typeof header !== 'object' || header === null) return false
  return typeof (header as { id?: unknown }).id === 'string'
}

/** Structural slice of one persisted session snapshot returned by `list`. */
interface PersistedSnapshotLike {
  readonly header: { readonly id: SessionId; readonly createdAt?: number }
}

/** Structural slice of the Host's session-persistence service that this plugin uses. */
interface SessionPersistenceLike {
  list(options?: unknown): Promise<readonly PersistedSnapshotLike[]>
}

/** Structural slice of the Host's session-projection cache that this plugin uses. */
interface SessionProjectionCacheLike {
  cachedSnapshot(
    meta: { readonly id: SessionId },
    keys?: readonly string[],
  ): { readonly values: Readonly<Record<string, unknown>> }
}

/** Read a folded projection value that may be stored raw or in a `{ val }` envelope. */
function projectionText(value: unknown): string | null {
  if (typeof value === 'string') return value.length === 0 ? null : value
  if (typeof value === 'object' && value !== null) {
    const inner: unknown = (value as { val?: unknown }).val
    if (typeof inner === 'string') return inner.length === 0 ? null : inner
  }
  return null
}

/**
 * One durable mark per session, keyed by session id. Reads are synchronous
 * against the domain's in-memory tables; all writes go through the domain's
 * durability-first write chain.
 */
export class SessionStatusService extends Service {
  /**
   * `connection` is deliberately absent: headless and TUI compositions mount no
   * HTTP bridge, and a required dependency would leave this whole entry
   * `pending` there (observed on dev4090 as
   * `pending (waiting for service: connection)`), which also disables the AI
   * tools and inference. The routes register only when a bridge exists.
   */
  static inject = ['storageDomain', 'tools', 'sessions', 'sessionTitle']

  static Config = Config

  #domain?: MarkerDomain

  /**
   * Title cache for sessions that are not loaded in memory. `sessionTitle.get`
   * only answers for live sessions, so cold sessions are resolved once through
   * the optional session-query engine and reused for a window instead of
   * re-reading their transcripts on every overview refresh. A `null` title is
   * the negative cache: the transcript was read and has no title event, and
   * those entries stay valid for `TITLE_ABSENT_TTL_MS` (longer than the
   * positive window, because re-decoding a large log to confirm the absence is
   * the expensive case).
   */
  #titleCache = new Map<string, { readonly title: string | null; readonly at: number }>()

  /**
   * Latches the "optional sessionQuery service is not mounted" warning so the
   * two-second refresh logs it once instead of on every poll.
   */
  #titleQueryMissingLogged = false

  /**
   * Headers for every session the persistence service knows about, cached for
   * ten seconds. Reading them once per window keeps the board from listing the
   * whole on-disk corpus on every two-second refresh.
   */
  #headerCache = new Map<string, { readonly id: SessionId; readonly createdAt: number }>()
  #headerCacheAt = 0

  /**
   * The one in-flight shared cross-corpus list scan. While a scan is running,
   * every caller that arrives shares its promise instead of starting another
   * full scan, so at most one `listSessions` scan runs at any moment — this is
   * what breaks the "slow scan → deadline fallback → next poll → new scan"
   * feedback loop. The entry is cleared in `finally`, not only on success: a
   * failed or timed-out scan must not keep pinning its dead promise on every
   * later request.
   */
  #sessionListInflight: Promise<Map<SessionId, number>> | undefined

  /**
   * Compact projection of the last successful cross-corpus scan — only the
   * fields `#collectUnmarked` consumes (`id`, `createdAt`), never the full
   * records — plus the instant its TTL window expires. The window is
   * `OVERVIEW_CACHE_TTL_MS` plus the per-snapshot random offset recorded in
   * `#sessionListTtlJitter`, so snapshots written together do not expire on
   * the same tick. A refresh that fails or times out keeps the previous
   * snapshot (or the empty one on first call), so a sick query engine degrades
   * the board to stale data instead of breaking it.
   */
  #sessionListCache = new Map<SessionId, number>()
  #sessionListCacheAt = 0
  #sessionListTtlJitter = 0

  /**
   * One signal for the whole service lifetime, passed to the shared
   * `listSessions` scan. It is created in `[Service.init]` and aborted by an
   * effect on teardown — never by a caller's per-request deadline, because the
   * scan is shared and one caller's timeout must not cancel a scan other
   * callers are still waiting on. It hands the kernel a real cancellation
   * handle for a stuck scan when the Host implements `listSessions` abort.
   */
  #scanAbort?: AbortController

  /**
   * In-flight background refresh of the overview caches, shared by every
   * concurrent request so a busy board starts at most one corpus scan.
   */
  #overviewRefresh?: Promise<void>

  /**
   * Realtime-only count of subagents the Host currently believes are running,
   * keyed by the parent session id and kept from the cordis
   * `subagent/start` / `subagent/end` events. These events are not persisted,
   * so the map is memory-only and resets to empty on a restart: the
   * `pending-subagent` fallback can therefore only fire for a turn that ends
   * while the process that started the subagent is still alive. Keyed by the
   * *parent* session because the mark lands on the parent's row, not the
   * child's.
   */
  #subagentsRunning = new Map<string, number>()

  /**
   * Per-session write chain for the automatic layers.
   *
   * Every automatic layer is a read-modify-write: it reads the current row,
   * decides whether to act, and writes the whole row back. Two events for the
   * same session can arrive while an earlier chain is still awaiting storage,
   * and the slower writer would then clobber the faster one — a status
   * regression no user could explain and no log would show. Chaining per session
   * id makes the layers for one session run in event order, while different
   * sessions still run concurrently.
   */
  #writeChains = new Map<string, Promise<void>>()

  /**
   * Run one event's automatic layers after every previously queued task for the
   * same session.
   *
   * `task` owns its own error handling: a rejected chain must not poison the
   * next event's run, so the stored tail always resolves.
   */
  #enqueue(sessionId: SessionId, task: () => Promise<void>): void {
    const key: string = sessionId as string
    const previous = this.#writeChains.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.#writeChains.set(key, next)
    const settle = (): void => {
      // Drop the chain once it is the tail, so the map tracks in-flight work
      // rather than every session ever seen.
      if (this.#writeChains.get(key) === next) this.#writeChains.delete(key)
    }
    next.then(settle, settle)
  }

  /**
   * Await a promise but never let it block the board forever.
   *
   * The optional Host services (`sessionPersistence`, `sessionQuery`) are
   * external to this bundle: on a Host whose implementation is slow, stuck, or
   * awaiting an engine this bundle never sees, a bare `await` can hang the
   * overview request until the client gives up — and then every retry hangs the
   * same way, so the board reads "loading" permanently. Racing the read against
   * a deadline degrades to the last snapshot (an empty one on first call) and
   * lets the request finish, which the client renders as a working board with
   * fewer titles instead of a spinner that never resolves.
   */
  async #withDeadline<T>(
    promise: Promise<T>,
    fallback: T,
    controller?: AbortController,
    timeoutMs: number = OVERVIEW_SERVICE_TIMEOUT_MS,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        // Cancel the underlying scan when one was supplied, so a timed-out
        // read cannot keep running and stack onto the next poll.
        controller?.abort()
        resolve(fallback)
      }, timeoutMs)
    })
    try {
      return await Promise.race([promise, deadline])
    } catch {
      // A rejected optional service is the same as a slow one here: degrade.
      return fallback
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Read an optional Host service without declaring it in `static inject`.
   *
   * The context proxy only exposes services listed in `inject`; reading an
   * optional one through the reflection layer keeps the plugin loadable on
   * Hosts that do not mount it, instead of failing activation for the whole
   * bundle. Returns `undefined` when the service is absent or its getter throws.
   */
  #optionalService<T>(name: string): T | undefined {
    try {
      return (this.ctx.reflect.get(name) as T | undefined) ?? undefined
    } catch {
      return undefined
    }
  }

  constructor(ctx: Context, public readonly config: Config) {
    // The service name must not collide with services the Host itself ships: DSH
    // 0.2.3 introduced an official `sessionStatus` service (unread/acknowledge
    // reading records in `@deepseek-ai/dsh-client-ui-session-status`), and cordis
    // refuses a second registration of the same name on one context.
    super(ctx, 'sessionStatusMarker')
  }

  /** Open the domain, then install every contribution as a reversible effect. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(MarkerDomainSpec)
    this.#domain = domain
    this.ctx.effect(() => () => { void domain.close() }, 'session-status-marker.domainClose')

    // One signal for the lifetime of the service, passed to the shared
    // listSessions scan and aborted by this effect on teardown. A caller's
    // per-request deadline must never abort it: the scan is shared, and
    // cancelling it for one slow caller would drop data every other caller is
    // still waiting on.
    const scanAbort = new AbortController()
    this.#scanAbort = scanAbort
    this.ctx.effect(() => () => { scanAbort.abort() }, 'session-status-marker.scanAbort')

    const setTool = this.#buildSetTool()
    const clearTool = this.#buildClearTool()
    this.ctx.effect(() => {
      const disposeSet = this.ctx.tools.register(setTool)
      const disposeClear = this.ctx.tools.register(clearTool)
      return () => { disposeSet(); disposeClear() }
    }, 'session-status-marker.tools')

    const stateRoute = {
      path: MARKER_STATE_PATH,
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => this.#handleState(request),
    }
    const listRoute = {
      path: MARKER_LIST_PATH,
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => this.#handleList(request),
    }
    const mutateRoute = {
      path: MARKER_MUTATE_PATH,
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => this.#handleMutate(request),
    }
    const overviewRoute = {
      path: MARKER_OVERVIEW_PATH,
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => this.#handleOverview(request),
    }
    // The HTTP bridge is injected lazily instead of declared as a dependency:
    // see the note on `inject` above — headless and TUI compositions mount no
    // bridge. `ctx.get('connection')` is not a substitute: a sibling row may
    // still be mounting when this initializer runs, and the undefined result
    // silently drops all four routes (observed on dev4090 as 404 `not found`
    // for every marker path while `/api/changes.summary` answered normally).
    this.ctx.inject(['connection'], (connectionCtx: Context) => {
      connectionCtx.effect(() => {
        const disposeState = connectionCtx.connection.fetch.register(stateRoute)
        const disposeList = connectionCtx.connection.fetch.register(listRoute)
        const disposeMutate = connectionCtx.connection.fetch.register(mutateRoute)
        const disposeOverview = connectionCtx.connection.fetch.register(overviewRoute)
        return () => { void disposeState(); void disposeList(); void disposeMutate(); void disposeOverview() }
      }, 'session-status-marker.fetchRoutes')
    })

    // Expose the effective configuration to the browser. The dynamic client
    // row carries no config (`BootPluginRow` has only id/inject/immediately),
    // so `apply(ctx, config)` on the client cannot see cordis.patch.yml. The
    // official `webserver/index-inject` global is the supported channel. The
    // settings page renders these values verbatim, so they must be the ones the
    // Host really runs with — schema defaults already applied, nothing copied.
    this.ctx.effect(() => {
      return this.ctx.on('webserver/index-inject', (table) => {
        const effective: ClientEffectiveConfig = {
          rowActionOrder: this.config.rowActionOrder ?? DEFAULT_ROW_ACTION_ORDER,
          menuItemOrder: this.config.menuItemOrder ?? DEFAULT_MENU_ITEM_ORDER,
          autoInfer: this.config.autoInfer === true,
          autoFallback: this.config.autoFallback === true,
          turnEndAwaitingAnswer: this.config.turnEndAwaitingAnswer === true,
          maxNoteLength: this.config.maxNoteLength,
          autoExpireMs: this.config.autoExpireMs,
          refreshIntervalMs: this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS,
          observationTtlMs: this.config.observationTtlMs ?? DEFAULT_OBSERVATION_TTL_MS,
        }
        table.push({
          kind: 'global',
          name: CLIENT_CONFIG_GLOBAL,
          value: { ...effective, effective },
        })
      })
    }, 'session-status-marker.clientConfig')

    if (this.config.autoInfer || this.config.autoFallback) {
      this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
        this.#enqueue(session.id, async () => {
          try {
            // Run the inference layer first when enabled; it is the more
            // specific mapping and writes a mark that the fallback net must
            // not touch.
            if (this.config.autoInfer) await this.#observe(session, event)
            await this.#observeFallback(session, event)
            // The observation layer runs last so it sees the row the two layers
            // above may have just created; it never creates a row itself.
            await this.#recordObservation(session, event)
          } catch (error: unknown) {
            this.ctx.logger.warn('session-status-marker: inference/fallback failed:', error)
          }
        })
      }, { global: true })
    } else {
      // Both automatic layers are off, so no mark is ever written from events.
      // The observation layer still has work to do: it refreshes what the
      // system last saw on sessions the user marked by hand, so the picker can
      // show "marked done, last observed running" instead of a bare label. It
      // runs as its own handler here because there is no inference/fallback
      // chain to append to — and it must not create rows, which keeps the
      // "automatic marking disabled" contract intact.
      this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
        this.#enqueue(session.id, async () => {
          try {
            await this.#recordObservation(session, event)
          } catch (error: unknown) {
            this.ctx.logger.warn('session-status-marker: observation failed:', error)
          }
        })
      }, { global: true })
    }

    // The fallback net runs on its own switch, and its subagent-aware branch
    // needs the realtime running count maintained here. These are cordis
    // runtime events (not persisted session events), so they only feed the
    // `pending-subagent` branch; a plain `turn/end` with no subagents still
    // resolves to `feedback` even when the Host never emitted a
    // subagent event.
    if (this.config.autoFallback) {
      this.ctx.effect(() => {
        const start = this.ctx.on('subagent/start', (info) => {
          this.#bumpSubagents(info.parentSessionId, 1)
        }, { global: true })
        const end = this.ctx.on('subagent/end', (info) => {
          this.#bumpSubagents(info.parentSessionId, -1)
        }, { global: true })
        return () => { start(); end() }
      }, 'session-status-marker.subagentCount')
    }

    // Warm the overview caches once at startup, in the background. The first
    // visit to the board then renders from memory instead of paying for a
    // serial walk of every session file while the user waits.
    this.ctx.effect(() => {
      void this.#refreshOverviewCaches()
      return () => { /* the scan aborts through #scanAbort on teardown */ }
    }, 'session-status-marker.overviewWarmup')
  }

  // ---- synchronous reads ---------------------------------------------------

  /** Raw stored row, or `null`. Does not apply lazy expiry. */
  getMark(sessionId: string): MarkRecord | null {
    return this.#table().get(sessionId) ?? null
  }

  /** Every stored row. Host-side enumeration only. */
  listAll(): IterableIterator<[string, MarkRecord]> {
    return this.#table().entries()
  }

  /**
   * Effective mark after lazy expiry of automatic rows. A manual row is never
   * expired. Expired rows are removed through the durable write chain.
   */
  async effectiveMark(sessionId: string): Promise<MarkRecord | null> {
    const row = this.getMark(sessionId)
    if (row === null) return null
    if (!isAutoMarkExpired(row, Date.now(), this.config.autoExpireMs)) return row
    await this.#table().delete(sessionId)
    return null
  }

  /**
   * Every stored row, minus automatic rows past their expiry.
   *
   * The list and the board must not show an automatic mark the store already
   * considers expired: a `feedback` written by the fallback net a day ago is
   * not a claim about the session any more, and rendering it would light up a
   * badge — and hide the session from the "unmarked" section — for something
   * nobody has touched. Expiry is applied here, in one place, so the two read
   * paths cannot drift apart. Rows are not deleted on read; the next write or
   * `.state` read of that session removes them.
   */
  #effectiveRows(): MarkRecord[] {
    const now = Date.now()
    const rows: MarkRecord[] = []
    for (const [, row] of this.listAll()) {
      if (isAutoMarkExpired(row, now, this.config.autoExpireMs)) continue
      rows.push(row)
    }
    return rows
  }

  // ---- durable writes ------------------------------------------------------

  /**
   * Insert or replace one mark. `source` distinguishes explicit intent from inference.
   *
   * The observation layer is carried across writes: a caller that only touches
   * the explicit layer (a manual click, an inference row) passes `null`
   * observations, and the stored observation is inherited instead of erased.
   * Only a caller that actually observed something sets `observedAtMs`, and
   * then all three observation fields are taken from that row.
   *
   * @returns the row that was actually stored, observation fields included. A
   *   caller that writes only the explicit layer must respond with *this* row,
   *   not its argument, or the browser briefly sees the observation disappear.
   */
  async putMark(row: MarkRecord): Promise<MarkRecord> {
    const previous = this.getMark(row.sessionId)
    const merged: MarkRecord = previous === null || row.observedAtMs !== null
      ? row
      : {
          ...row,
          observedStatus: previous.observedStatus,
          observedEvent: previous.observedEvent,
          observedAtMs: previous.observedAtMs,
        }
    await this.#table().put(merged.sessionId, merged)
    return merged
  }

  /** Remove one mark. Returns whether a row existed. */
  async clearMark(sessionId: string): Promise<boolean> {
    return await this.#table().delete(sessionId)
  }

  /**
   * Build an explicit row.
   * @param sessionId - Session the row belongs to.
   * @param status - Status to store.
   * @param note - Already validated note, or `null`.
   * @param subjectId - Optional turn/goal/job/subagent id the mark refers to.
   * @param source - `manual` for user actions, `agent` for model tool calls.
   * @returns The row to persist.
   */
  explicitRow(
    sessionId: string,
    status: StatusEnum,
    note: string | null,
    subjectId: string | null,
    source: ExplicitSource = 'manual',
  ): MarkRecord {
    return {
      version: MARK_VERSION,
      insertedAtMs: Date.now(),
      seq: 0,
      sessionId,
      status,
      source,
      subjectId,
      autoReason: null,
      note,
      // Explicit writes leave the observation layer alone; `putMark` inherits
      // whatever the row already recorded.
      observedStatus: null,
      observedEvent: null,
      observedAtMs: null,
    }
  }

  /** Validate a note against the deployed limit instead of hardcoding a value. */
  #checkedNote(note: string | null): string | null {
    if (note === null) return null
    if (note.length > this.config.maxNoteLength) {
      throw new Error(`session-status-marker: note exceeds maxNoteLength (${this.config.maxNoteLength})`)
    }
    return note
  }

  /**
   * Adjust the realtime subagent running count for a parent session by `delta`
   * (`+1` on `subagent/start`, `-1` on `subagent/end`). The count never goes
   * negative, and a parent that drops to zero is removed so a later poll does
   * not see a stale `pending-subagent` signal.
   */
  #bumpSubagents(parentSessionId: SessionId | undefined, delta: 1 | -1): void {
    if (parentSessionId === undefined) return
    const key: string = parentSessionId as string
    const next = (this.#subagentsRunning.get(key) ?? 0) + delta
    if (next <= 0) this.#subagentsRunning.delete(key)
    else this.#subagentsRunning.set(key, next)
  }

  // ---- read-only inference -------------------------------------------------

  async #observe(session: Session, event: SessionEvent): Promise<void> {
    const proposed = inferStatus({
      type: event.type,
      seq: event.seq,
      time: event.time,
      data: event.data,
      turnEndAwaitingAnswer: this.config.turnEndAwaitingAnswer,
    })
    if (proposed === null) return
    const current = await this.effectiveMark(session.id)
    // The `turn/completed` fallback mark only fires when the session has no
    // mark at all — an explicit mark from the user or the model this turn, or
    // any auto mark from an earlier rule, must not be overwritten. This is
    // stronger than `shouldApplyInference`: that one already refuses to
    // overwrite `manual` / `agent`, but it would let a `turn/completed`
    // fallback replace an auto mark from TodoWrite or `job/settled` earlier in
    // the same turn. Gating on `current === null` here keeps the fallback as a
    // true last-resort catch-all.
    if (proposed.autoReason === 'turn-completed' && current !== null) return
    if (!shouldApplyInference(current, proposed)) return
    const row: MarkRecord = {
      version: MARK_VERSION,
      insertedAtMs: event.time,
      seq: event.seq,
      sessionId: session.id,
      status: proposed.status,
      source: 'auto',
      subjectId: proposed.subjectId,
      autoReason: proposed.autoReason,
      note: proposed.note,
      observedStatus: null,
      observedEvent: null,
      observedAtMs: null,
    }
    await this.putMark(row)
  }

  /**
   * The fallback net, a layer separate from `#observe`'s inference. Runs only
   * when `autoFallback` is enabled and, unlike the inference layer, fires on
   * the *absence* of a mark rather than a specific event→state mapping. A
   * running turn with no mark reads as `todo`; a normally-completed turn with
   * no mark reads as `feedback`, upgraded to `pending-subagent` when
   * the Host still believes subagents are running. `interrupted` / `forked`
   * are excluded because they are synthesized at crash recovery, not produced
   * by a live loop. A terminal fallback may supersede its own transient
   * running mark on the same turn, so a session does not get stuck on `todo`.
   */
  async #observeFallback(session: Session, event: SessionEvent): Promise<void> {
    if (!this.config.autoFallback) return
    // The fallback runs after the inference layer would have had its chance at
    // this event, so a mark produced by inference (or by an explicit write)
    // is already present and the `current === null` gate below refuses to
    // overwrite it.
    const current = await this.effectiveMark(session.id)
    const proposed = inferFallback({
      type: event.type,
      data: event.data,
      subagentsRunning: this.#subagentsRunning.get(session.id as string) ?? 0,
    })
    if (proposed === null) return
    if (current !== null && !shouldApplyFallback(current, proposed)) return
    const row: MarkRecord = {
      version: MARK_VERSION,
      insertedAtMs: event.time,
      seq: event.seq,
      sessionId: session.id,
      status: proposed.status,
      source: 'auto',
      subjectId: null,
      autoReason: proposed.autoReason,
      note: proposed.note,
      observedStatus: null,
      observedEvent: null,
      observedAtMs: null,
    }
    await this.putMark(row)
  }

  /**
   * Record what the event log last showed, beside whatever explicit mark exists.
   *
   * This is the observation layer, and it is the reason a session marked `done`
   * by hand can still say "a turn is running right now". It never writes the
   * explicit fields and never creates a row: when no mark exists, the inference
   * and fallback layers own row creation, and this layer attaches on their next
   * pass. `subagent/start` and `subagent/end` are absent from
   * {@link OBSERVED_EVENT_VALUES} on purpose — they carry no readable state,
   * only the running counter that `#bumpSubagents` maintains.
   */
  async #recordObservation(session: Session, event: SessionEvent): Promise<void> {
    const observed = observationOf(event)
    if (observed === null) return
    const current = await this.effectiveMark(session.id)
    if (current === null) return
    if (!shouldRecordObservation(current, observed)) return
    await this.putMark({
      ...current,
      observedStatus: observed.status,
      observedEvent: observed.event,
      observedAtMs: observed.atMs,
    })
  }

  // ---- exact fetch routes --------------------------------------------------

  async #handleState(request: Request): Promise<Response> {
    const sessionId = new URL(request.url).searchParams.get('sessionId')
    if (sessionId === null || sessionId.length === 0) {
      return Response.json({ ok: false, code: 'invalid-body', message: 'sessionId query param required' }, { status: 400 })
    }
    return Response.json({ sessionId, mark: await this.effectiveMark(sessionId) })
  }

  /**
   * Full mark list, with a conditional-read shortcut: when the client sends the
   * revision it last saw and that still equals the current snapshot's revision,
   * return no rows and `unchanged:true` so the browser can skip repainting.
   *
   * The revision is derived only from sorted rows, never from a module counter:
   * a Host restart must produce the same revision for the same data, otherwise
   * browsers that cached a revision would never refresh again.
   */
  async #handleList(request: Request): Promise<Response> {
    const marks = this.#effectiveRows()
    const revision = marksRevision(marks)
    const since = new URL(request.url).searchParams.get('since')
    const refreshIntervalMs = this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    if (since !== null && since === revision) {
      // The caller already holds this revision, so echoing it back would only
      // repeat a string the client already has. Omitting it keeps the
      // unchanged response to the two fields the client actually needs.
      return Response.json({ marks: [], refreshIntervalMs, unchanged: true })
    }
    return Response.json({ marks, refreshIntervalMs, revision, unchanged: false })
  }

  /**
   * Group every mark by status and join each with its session title. Only
   * non-empty groups are returned, in `STATUS_VALUES` order; group members are
   * sorted by `updatedAtMs` descending. Titles come from the session-title
   * projection; a missing session or a throwing title read yields `null`.
   *
   * The optional Host reads (persisted headers, cross-corpus session list, cold
   * titles) all run inside the shared background refresh instead of the
   * request path: the response joins that refresh for at most
   * `OVERVIEW_REFRESH_WAIT_MS` and then answers from whatever the caches
   * already hold, so a serial walk of every session file — or a slow transcript
   * batch — can never hold the client's abort window hostage.
   *
   * Conditional refresh follows `#handleList`: the caller sends the revision it
   * last saw as `?since=`, and when it still equals the digest of the current
   * payload the response carries `{ refreshIntervalMs, unchanged: true }` with
   * no payload, so the browser skips repainting.
   */
  async #handleOverview(request: Request): Promise<Response> {
    const since = new URL(request.url).searchParams.get('since')
    const refreshIntervalMs = this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS

    const sessions = new Map<string, Session>()
    try {
      for (const session of this.ctx.sessions.list()) sessions.set(session.id, session)
    } catch { /* sessions unavailable — every title falls back to null */ }

    const rows = this.#effectiveRows()
    const marked = new Set(rows.map((row) => row.sessionId))
    const coldIds = rows.filter((row) => !sessions.has(row.sessionId)).map((row) => row.sessionId)

    // Serve from memory; the corpus scan runs behind the response. The
    // persisted list is a fully serial walk of every session directory on disk
    // (one libuv round-trip per file, no concurrency, no cache), so awaiting it
    // on a large store costs far more than the client's abort window and the
    // board dies on the spinner. A warm cache makes this join free; a cold or
    // slow one is capped at the refresh wait, after which the board renders
    // whatever is already known and fills in on the next poll.
    await this.#withDeadline(
      this.#refreshOverviewCaches(),
      undefined,
      undefined,
      OVERVIEW_REFRESH_WAIT_MS,
    )

    const headerMap = this.#headerCache
    const sessionList = this.#sessionListCache
    const candidates = this.#unmarkedCandidates(marked, headerMap, sessionList)
    const candidateIds = [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, DEFAULT_UNMARKED_LIMIT)
      .map(([id]) => id)
    const titleIds = [...new Set([...coldIds, ...candidateIds])]
    // Titles already remembered by a background refresh, plus the zero-I/O
    // projection cache. No transcript is read on the request path.
    const coldTitles = new Map<string, string>()
    for (const id of titleIds) {
      const hit = this.#titleCache.get(id)
      // A null title is the negative cache: the session is known to have no
      // title, which is the same as no entry for the purposes of this join.
      if (hit !== undefined && hit.title !== null) coldTitles.set(id, hit.title)
    }
    for (const [id, title] of this.#cachedTitles(titleIds, headerMap)) {
      if (!coldTitles.has(id)) coldTitles.set(id, title)
    }

    const byStatus = new Map<StatusEnum, OverviewEntry[]>()
    let totalMarked = 0
    for (const row of rows) {
      let title: string | null = null
      const session = sessions.get(row.sessionId)
      if (session !== undefined) {
        try { title = this.ctx.sessionTitle.get(session)?.title ?? null } catch { title = null }
      } else {
        title = coldTitles.get(row.sessionId) ?? null
      }
      const entry: OverviewEntry = {
        sessionId: row.sessionId,
        title,
        status: row.status,
        note: row.note,
        source: row.source,
        autoReason: row.autoReason,
        updatedAtMs: row.insertedAtMs,
        // Observation layer, passed through as stored. Staleness is a client
        // concern: the TTL is a display rule, and the Host must not re-decide it
        // per request or a clock skew between Host and Browser changes the UI.
        observedStatus: row.observedStatus,
        observedEvent: row.observedEvent,
        observedAtMs: row.observedAtMs,
      }
      totalMarked++
      const bucket = byStatus.get(row.status) ?? []
      bucket.push(entry)
      byStatus.set(row.status, bucket)
    }

    const groups: StatusGroup[] = []
    for (const status of STATUS_VALUES) {
      const entries = byStatus.get(status)
      if (entries !== undefined && entries.length > 0) {
        entries.sort((a, b) => b.updatedAtMs - a.updatedAtMs)
        groups.push({ status, count: entries.length, entries })
      }
    }
    let unmarked: UnmarkedSessions = { count: 0, entries: [] }
    try {
      unmarked = await this.#collectUnmarked(marked, sessionList, coldTitles, headerMap)
    } catch { unmarked = { count: 0, entries: [] } }

    // Digest only the payload: `refreshIntervalMs` is config, not data, and an
    // unchanged config must not force a repaint.
    const revision = overviewRevision(JSON.stringify({ groups, totalMarked, unmarked }))
    if (since !== null && since === revision) {
      // The caller already holds this payload, so echoing it would only repeat
      // bytes. The unchanged response keeps the two fields the client needs.
      return Response.json({ refreshIntervalMs, unchanged: true })
    }
    return Response.json({ groups, totalMarked, unmarked, refreshIntervalMs, revision, unchanged: false })
  }

  /**
   * Resolve display titles for sessions that are not loaded in memory.
   *
   * `sessionTitle.get` only answers for live sessions, so a session that was
   * closed since it was marked would show as "untitled" forever. When the Host
   * mounts the optional session-query engine this reads their titles from the
   * transcript and remembers them: a real title for `TITLE_CACHE_TTL_MS`, an
   * absence for `TITLE_ABSENT_TTL_MS`, so frequent overview refreshes do not
   * re-decode the same (often multi-megabyte) transcripts.
   *
   * A batch that times out or rejects leaves no entries behind — per the
   * upstream contract a cancellation rejects the complete operation — but the
   * failure is logged so a chronically slow or dead engine is visible in the
   * Host log instead of surfacing only as "untitled" rows on the board.
   */
  async #readColdTitles(ids: readonly string[], timeoutMs: number = OVERVIEW_SERVICE_TIMEOUT_MS): Promise<Map<string, string>> {
    const resolved = new Map<string, string>()
    if (ids.length === 0) return resolved
    const now = Date.now()
    const stale = ids.filter((id) => {
      const hit = this.#titleCache.get(id)
      if (hit === undefined) return true
      const ttl = hit.title === null ? TITLE_ABSENT_TTL_MS : TITLE_CACHE_TTL_MS
      return now - hit.at > ttl
    })
    if (stale.length > 0) {
      const query = this.#optionalService<SessionQueryLike>('sessionQuery')
      if (query === undefined || typeof query.readTitleSnapshots !== 'function') {
        // Logged once: the service is a property of the Host composition, not
        // of the poll, so repeating it on every refresh would spam the log.
        if (!this.#titleQueryMissingLogged) {
          this.#titleQueryMissingLogged = true
          this.ctx.logger.warn('session-status-marker: optional sessionQuery service is not mounted; cold sessions stay untitled')
        }
      } else {
        // Give the reader a cancellable signal: when the deadline fires the
        // underlying transcript scan is aborted instead of lingering in the
        // background and stacking a new scan onto every subsequent poll.
        const controller = new AbortController()
        try {
          const results: unknown = await this.#withDeadline(
            query.readTitleSnapshots(stale, controller.signal),
            null,
            controller,
            timeoutMs,
          )
          if (Array.isArray(results)) {
            const withTitle = new Set<string>()
            for (const result of results as readonly TitleObservationResult[]) {
              if (result?.status === 'fulfilled' && typeof result.value?.title?.title === 'string') {
                this.#rememberTitle(result.sessionId, result.value.title.title, now)
                withTitle.add(result.sessionId)
              }
            }
            // Ids that came back rejected, or fulfilled without a title, are
            // negative-cached so the next refresh does not re-decode their
            // transcripts for TITLE_ABSENT_TTL_MS.
            for (const id of stale) {
              if (!withTitle.has(id)) this.#rememberTitle(id, null, now)
            }
          } else {
            // The deadline fired (the controller aborts the read) or the batch
            // rejected outright; nothing was cached. Log it instead of
            // swallowing: this is the path that left every board row "untitled"
            // while the desktop log showed no trace of it.
            this.ctx.logger.warn(
              controller.signal.aborted
                ? `session-status-marker: cold title read aborted after ${timeoutMs} ms; ${stale.length} id(s) left without titles`
                : `session-status-marker: cold title read rejected; ${stale.length} id(s) left without titles`,
            )
          }
        } catch (error) {
          this.ctx.logger.warn('session-status-marker: cold title read failed:', error)
        }
      }
    }
    for (const id of ids) {
      const hit = this.#titleCache.get(id)
      if (hit !== undefined && hit.title !== null) resolved.set(id, hit.title)
    }
    return resolved
  }

  /**
   * Remember one cold title (or an absence, with `title: null`), evicting
   * expired entries first so the cache stays bounded for a Host with thousands
   * of sessions: entries past their own reuse window (positive or absence TTL)
   * go first, then the oldest remaining entry fills the last slot.
   */
  #rememberTitle(id: string, title: string | null, at: number): void {
    if (this.#titleCache.size >= TITLE_CACHE_MAX_ENTRIES) {
      for (const [key, hit] of this.#titleCache) {
        const ttl = hit.title === null ? TITLE_ABSENT_TTL_MS : TITLE_CACHE_TTL_MS
        if (at - hit.at > ttl) this.#titleCache.delete(key)
      }
      if (this.#titleCache.size >= TITLE_CACHE_MAX_ENTRIES) {
        const first = this.#titleCache.keys().next().value
        if (first !== undefined) this.#titleCache.delete(first)
      }
    }
    this.#titleCache.set(id, { title, at })
  }

  /**
   * Headers for every session on disk, cached for ten seconds.
   *
   * Uses the optional persistence service so the board can enumerate and name
   * sessions the Host has not loaded into memory. A Host without that service
   * simply returns the previous (possibly empty) snapshot.
   */
  async #persistedHeaders(): Promise<Map<string, { readonly id: SessionId; readonly createdAt: number }>> {
    const now = Date.now()
    if (now - this.#headerCacheAt < 10_000) return this.#headerCache
    const persistence = this.#optionalService<SessionPersistenceLike>('sessionPersistence')
    if (persistence === undefined || typeof persistence.list !== 'function') return this.#headerCache
    try {
      const snapshots: unknown = await this.#withDeadline(persistence.list(), null)
      if (Array.isArray(snapshots)) {
        const next = new Map<string, { readonly id: SessionId; readonly createdAt: number }>()
        for (const snapshot of snapshots as readonly PersistedSnapshotLike[]) {
          const header = snapshot?.header
          if (typeof header?.id === 'string') next.set(header.id, { id: header.id, createdAt: header.createdAt ?? 0 })
        }
        if (next.size > 0) {
          this.#headerCache = next
          this.#headerCacheAt = now
        }
      }
    } catch { /* persistence unavailable — keep the last snapshot */ }
    return this.#headerCache
  }

  /**
   * The shared cross-corpus list snapshot, refreshing it when its TTL window
   * has expired.
   *
   * Refresh is single-flight: while a scan is in flight, every caller that
   * arrives shares its promise, so at most one `listSessions` scan runs at
   * any moment. A refresh that fails or times out keeps the previous snapshot
   * and still advances the TTL clock, so a sick query engine degrades the
   * board to stale data and is retried once per window instead of on every
   * two-second poll.
   */
  async #sessionListSnapshotNow(): Promise<Map<SessionId, number>> {
    const now = Date.now()
    if (now < this.#sessionListCacheAt + OVERVIEW_CACHE_TTL_MS + this.#sessionListTtlJitter) {
      return this.#sessionListCache
    }
    if (this.#sessionListInflight !== undefined) return this.#sessionListInflight
    const scan = this.#scanSessionList(now)
    this.#sessionListInflight = scan
    try {
      return await scan
    } finally {
      if (this.#sessionListInflight === scan) this.#sessionListInflight = undefined
    }
  }

  /**
   * Run the one shared `listSessions` scan and project it down to the two
   * fields `#collectUnmarked` consumes.
   *
   * The scan uses the service-lifetime signal, never a caller's per-request
   * deadline: the scan is shared, and one slow caller must not cancel a scan
   * other callers are still waiting on. A failure keeps the previous snapshot
   * (an empty one on first call) so the board degrades to stale data instead
   * of breaking.
   */
  async #scanSessionList(now: number): Promise<Map<SessionId, number>> {
    let raw: unknown = null
    const query = this.#optionalService<
      SessionQueryLike & { listSessions?: (signal?: AbortSignal) => Promise<unknown> }
    >('sessionQuery')
    if (query !== undefined && typeof query.listSessions === 'function') {
      raw = await this.#withDeadline(query.listSessions(this.#scanAbort?.signal), null)
    }
    let snapshot = this.#sessionListCache
    if (Array.isArray(raw)) {
      const next = new Map<SessionId, number>()
      for (const record of (raw as readonly unknown[]).filter(isSessionRecord)) {
        next.set(record.header.id, record.header.createdAt ?? 0)
      }
      if (next.size > 0) snapshot = next
    }
    this.#sessionListCache = snapshot
    this.#sessionListCacheAt = now
    this.#sessionListTtlJitter = Math.random() * OVERVIEW_CACHE_TTL_JITTER_MS
    return snapshot
  }

  /** Folded titles from the projection cache for ids whose header is known. */
  #cachedTitles(
    ids: readonly string[],
    headers: ReadonlyMap<string, { readonly id: SessionId }>,
  ): Map<string, string> {
    const out = new Map<string, string>()
    const cache = this.#optionalService<SessionProjectionCacheLike>('sessionProjectionCache')
    if (cache === undefined || typeof cache.cachedSnapshot !== 'function') return out
    for (const id of ids) {
      const header = headers.get(id)
      if (header === undefined) continue
      try {
        const snapshot = cache.cachedSnapshot({ id: header.id }, ['title'])
        const text = projectionText(snapshot?.values?.title)
        if (text !== null) out.set(id, text)
      } catch { /* no cached projection for this header */ }
    }
    return out
  }

  /**
   * Refresh the three overview caches in the background, single-flight.
   *
   * The reads it performs (`sessionPersistence.list`, `listSessions`, cold
   * titles) each walk every session file on disk serially, so they belong off
   * the request path: the response is built from the caches, and this method
   * only ever runs ahead of them. Concurrent callers share one task, each cache
   * keeps its own reuse window, and a failure leaves the previous snapshot in
   * place.
   */
  #refreshOverviewCaches(): Promise<void> {
    const running = this.#overviewRefresh
    if (running !== undefined) return running
    const task = (async (): Promise<void> => {
      try {
        const settled = await Promise.all([
          this.#withDeadline(this.#persistedHeaders(), this.#headerCache),
          this.#withDeadline(this.#sessionListSnapshotNow(), this.#sessionListCache),
        ])
        const sessions = new Map<string, Session>()
        try {
          for (const session of this.ctx.sessions.list()) sessions.set(session.id, session)
        } catch { /* live sessions unavailable — cold ids stay cold */ }
        const rows = this.#effectiveRows()
        const marked = new Set(rows.map((row) => row.sessionId))
        const coldIds = rows.filter((row) => !sessions.has(row.sessionId)).map((row) => row.sessionId)
        const candidates = this.#unmarkedCandidates(marked, settled[0], settled[1])
        const candidateIds = [...candidates.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, DEFAULT_UNMARKED_LIMIT)
          .map(([id]) => id)
        // Marked rows are what the board renders, so they get the title batch
        // first; the unmarked candidates run second and can never starve the
        // rows the user is actually looking at. Each batch runs under the
        // background deadline and remembers what it learned, so a batch that
        // is aborted mid-read loses at most its own ids.
        if (coldIds.length > 0) await this.#readColdTitles(coldIds)
        if (candidateIds.length > 0) await this.#readColdTitles(candidateIds)
      } catch (error) {
        this.ctx.logger.warn('session-status-marker: overview cache refresh failed:', error)
      }
    })()
    const tracked = task.finally(() => {
      if (this.#overviewRefresh === tracked) this.#overviewRefresh = undefined
    })
    this.#overviewRefresh = tracked
    return tracked
  }

  /**
   * Merge the three candidate sources into one id → createdAt map, skipping
   * anything already marked. Pure and allocation-cheap: `#handleOverview`
   * calls it to learn which session ids need a title, and `#collectUnmarked`
   * calls it again to build the block, so both see the same set.
   */
  #unmarkedCandidates(
    marked: ReadonlySet<string>,
    headerMap: ReadonlyMap<string, { readonly id: SessionId; readonly createdAt: number }>,
    sessionList: ReadonlyMap<SessionId, number>,
  ): Map<SessionId, number> {
    const candidates = new Map<SessionId, number>()
    const add = (id: SessionId, createdAt: number | undefined): void => {
      if (marked.has(id) || candidates.has(id)) return
      candidates.set(id, createdAt ?? 0)
    }
    try {
      for (const session of this.ctx.sessions.list()) add(session.id, session.header?.createdAt)
    } catch { /* sessions unavailable — fall through to the on-disk headers */ }
    for (const [, header] of headerMap) add(header.id, header.createdAt)
    for (const [id, createdAt] of sessionList) add(id, createdAt)
    return candidates
  }

  /**
   * List a bounded slice of sessions that carry no mark, newest first, so the
   * board can offer them for marking.
   *
   * Candidates come from three sources, merged by id: live sessions the Host has
   * loaded, headers from the optional persistence service (every session on
   * disk), and the shared cross-corpus list snapshot. Any one of them is enough
   * to populate the block, so a composition that omits the query engine still
   * shows the sessions the user can actually see.
   *
   * Every input is already resolved by `#handleOverview`'s shared wave: the
   * snapshot is cached and single-flight, the titles were read under the same
   * budget as the marked-cold titles, and the headers are cached. This method
   * performs NO further I/O, so a slow Host is never asked to scan a second
   * time after the first wave's deadline has already elapsed.
   */
  async #collectUnmarked(
    marked: ReadonlySet<string>,
    sessionList: ReadonlyMap<SessionId, number>,
    coldTitles: ReadonlyMap<string, string>,
    headerMap: ReadonlyMap<string, { readonly id: SessionId; readonly createdAt: number }>,
  ): Promise<UnmarkedSessions> {
    const candidates = this.#unmarkedCandidates(marked, headerMap, sessionList)
    const ordered = [...candidates.entries()].sort((a, b) => b[1] - a[1])
    const slice = ordered.slice(0, DEFAULT_UNMARKED_LIMIT)
    const ids = slice.map(([id]) => id)
    // Reuse the titles read in the single wave; a candidate that appeared only
    // in this fresh sessionList (not in the cached one used to build titleIds)
    // is filled from the zero-I/O projection cache instead of a new disk scan.
    const titles = new Map<string, string>()
    for (const id of ids) {
      const title = coldTitles.get(id)
      if (title !== undefined) titles.set(id, title)
    }
    for (const [id, title] of this.#cachedTitles(ids, headerMap)) {
      if (!titles.has(id)) titles.set(id, title)
    }
    const entries: UnmarkedEntry[] = slice.map(([id, createdAt]) => {
      let title: string | null = titles.get(id) ?? null
      if (title === null && typeof this.ctx.sessions.get === 'function') {
        const live = this.ctx.sessions.get(id)
        if (live !== undefined) {
          try { title = this.ctx.sessionTitle.get(live)?.title ?? null } catch { title = null }
        }
      }
      return { sessionId: id, title, updatedAtMs: createdAt }
    })
    return { count: candidates.size, entries }
  }

  async #handleMutate(request: Request): Promise<Response> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ ok: false, code: 'invalid-json', message: 'malformed request body' }, { status: 400 })
    }
    const action = typeof body === 'object' && body !== null && 'action' in body
      ? (body as { action: unknown }).action
      : undefined

    if (action === 'clear') {
      const parsed = ClearMarkBodySchema.safeParse(body)
      if (!parsed.success) return Response.json({ ok: false, code: 'invalid-body', message: parsed.error.message }, { status: 400 })
      const deleted = await this.clearMark(parsed.data.sessionId)
      return Response.json({ ok: true, sessionId: parsed.data.sessionId, mark: null, deleted })
    }

    if (action === 'set') {
      const parsed = SetMarkBodySchema.safeParse(body)
      if (!parsed.success) return Response.json({ ok: false, code: 'invalid-body', message: parsed.error.message }, { status: 400 })
      const row = this.explicitRow(
        parsed.data.sessionId,
        parsed.data.status,
        this.#checkedNote(parsed.data.note),
        parsed.data.subjectId,
        parsed.data.source,
      )
      // Respond with the row `putMark` actually stored: it inherits the stored
      // observation, and the browser caches this response verbatim.
      const stored = await this.putMark(row)
      return Response.json({ ok: true, sessionId: stored.sessionId, mark: stored })    }

    return Response.json({ ok: false, code: 'unsupported-action', message: String(action) }, { status: 400 })
  }

  // ---- AI tools ------------------------------------------------------------

  #buildSetTool() {
    const service = this
    return defineTool({
      name: 'set_session_status',
      description: [
        'Set an explicit status label on the current session so the session list shows where it stands.',
        'WHEN TO USE: the conversation reaches a state another person needs to see in the session list, such as work delivered and waiting for the user to react, a subagent still running, work blocked, or a task genuinely finished. A finished reply is itself a state worth marking: when you deliver a result the user has not yet reacted to, mark it feedback so the session list shows work is waiting on them.',
        'WHEN NOT TO USE: Do not mark a session done merely because a reply finished. A turn ending only means this reply finished; it does not mean the user goal is complete. Reserve done for a deliberate user request or your own confirmed judgement that the goal is met.',
        'DO NOT USE FOR: do not use this tool to record intermediate tool progress or an inference you are guessing at. Automatic inference never overwrites a mark you set with this tool, and a later call to this tool replaces an earlier mark of either kind.',
        'USAGE: pass one status from todo, done, stopped, blocked, review, pending-subagent, awaiting-answer, feedback. Statuses written by you through this tool are recorded with source agent, so the hover card can show that a model decided. Add a short note when the reason is not obvious, and a subjectId when the mark refers to a specific turn, goal, job, or subagent.',
        'EXAMPLES: you delivered a result and are waiting for the user to review it, call with status feedback and a note saying what you delivered. The user asked you to pause and wait for their answer, call with status awaiting-answer and a note naming what you need. A subagent is launched and still running, call with status pending-subagent and its id as subjectId. Work is genuinely complete and confirmed, call with status done. To remove an incorrect mark, use clear_session_status instead of this tool.',
      ].join(' '),
      parameters: {
        status: { type: 'string', required: true, enum: STATUS_VALUES, description: 'Status label to record for the current session.' },
        note: { type: 'string', description: 'Optional short human-readable reason for the mark.' },
        subjectId: { type: 'string', description: 'Optional id of the turn, goal, job, or subagent this mark refers to.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            sessionId: { type: 'string', required: true },
            status: { type: 'string', required: true },
            source: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `Session ${value.sessionId} marked ${value.status} (${value.source}).` }],
      },
      async execute(args, exec) {
        const sessionId = agentSessionId(exec)
        const note = service.#checkedNote(args.note ?? null)
        const row = service.explicitRow(sessionId, args.status, note, args.subjectId ?? null, 'agent')
        await service.putMark(row)
        return { ok: true, sessionId, status: row.status, source: row.source }
      },
    })
  }

  #buildClearTool() {
    const service = this
    return defineTool({
      name: 'clear_session_status',
      description: 'Remove the status mark from the current session.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', required: true },
            sessionId: { type: 'string', required: true },
            deleted: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `Session ${value.sessionId} mark ${value.deleted ? 'cleared' : 'was already absent'}.` }],
      },
      async execute(_args, exec) {
        const sessionId = agentSessionId(exec)
        const deleted = await service.clearMark(sessionId)
        return { ok: true, sessionId, deleted }
      },
    })
  }

  #table() {
    if (this.#domain === undefined) throw new Error('session-status-marker: storage domain is not open')
    return this.#domain.table(MARKER_TABLE_NAME)
  }
}

/** Resolve the caller's session id without hardcoding an agent-tree assumption. */
function agentSessionId(exec: { readonly agent?: { readonly id: string } | undefined }): string {
  const id = exec.agent?.id
  if (id === undefined) throw new Error('session-status-marker: this tool requires an active agent session')
  return id
}

export default SessionStatusService
