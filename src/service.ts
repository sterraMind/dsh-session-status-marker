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
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
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
  DEFAULT_ROW_ACTION_ORDER,
  DEFAULT_MENU_ITEM_ORDER,
  CLIENT_CONFIG_GLOBAL,
  MARKER_STATE_PATH,
  MARKER_LIST_PATH,
  MARKER_MUTATE_PATH,
  MARKER_OVERVIEW_PATH,
  marksRevision,
  SetMarkBodySchema,
  ClearMarkBodySchema,
  type MarkRecord,
  type StatusEnum,
  type StatusGroup,
  type OverviewEntry,
} from './types.js'
import { inferStatus, shouldApplyInference, isAutoMarkExpired } from './inference.js'

/** Deployment configuration. Required fields fail at load; `refreshIntervalMs` defaults. */
export interface Config {
  /** Enable read-only `session/event` inference of automatic marks. */
  autoInfer: boolean
  /** Maximum characters accepted in a note (tool arg and HTTP body). */
  maxNoteLength: number
  /** Automatic marks older than this many ms are lazily discarded; `0` disables expiry. */
  autoExpireMs: number
  /** Browser re-read cadence for the mark list, in ms; defaults to 2000. */
  refreshIntervalMs: number
  /** Order of the row-action status button; raise or lower to coexist with other plugins. */
  rowActionOrder: number
  /** Order of the row-menu status item; raise or lower to coexist with other plugins. */
  menuItemOrder: number
}

/** Schemastery schema, consumed by Cordis when this row loads. */
export const Config = z.object({
  autoInfer: z.boolean().required(),
  maxNoteLength: z.natural().min(1).required(),
  autoExpireMs: z.natural().required(),
  refreshIntervalMs: z.natural().min(250).default(DEFAULT_REFRESH_INTERVAL_MS),
  rowActionOrder: z.natural().default(DEFAULT_ROW_ACTION_ORDER),
  menuItemOrder: z.natural().default(DEFAULT_MENU_ITEM_ORDER),
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
    sessionStatus: SessionStatusService
    /**
     * Session-title service (from `@deepseek-ai/dsh-session-title`, not
     * installed here). `get` returns the latest folded title snapshot for a
     * live session, or `undefined` before eligible input.
     */
    sessionTitle: { get(session: Session): { readonly title: string } | undefined }
  }
  interface Events {
    /** Collect structured index-injection rows for the rendered Web GUI page. */
    'webserver/index-inject'(table: IndexGlobalInjection[], peer: unknown): void
  }
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

  constructor(ctx: Context, public readonly config: Config) {
    super(ctx, 'sessionStatus')
  }

  /** Open the domain, then install every contribution as a reversible effect. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(MarkerDomainSpec)
    this.#domain = domain
    this.ctx.effect(() => () => { void domain.close() }, 'sessionStatus.domainClose')

    const setTool = this.#buildSetTool()
    const clearTool = this.#buildClearTool()
    this.ctx.effect(() => {
      const disposeSet = this.ctx.tools.register(setTool)
      const disposeClear = this.ctx.tools.register(clearTool)
      return () => { disposeSet(); disposeClear() }
    }, 'sessionStatus.tools')

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
      fetch: () => this.#handleOverview(),
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
      }, 'sessionStatus.fetchRoutes')
    })

    // Expose the configured slot orders to the browser. The dynamic client
    // row carries no config (`BootPluginRow` has only id/inject/immediately),
    // so `apply(ctx, config)` on the client cannot see cordis.patch.yml. The
    // official `webserver/index-inject` global is the supported channel.
    this.ctx.effect(() => {
      return this.ctx.on('webserver/index-inject', (table) => {
        table.push({
          kind: 'global',
          name: CLIENT_CONFIG_GLOBAL,
          value: {
            rowActionOrder: this.config.rowActionOrder ?? DEFAULT_ROW_ACTION_ORDER,
            menuItemOrder: this.config.menuItemOrder ?? DEFAULT_MENU_ITEM_ORDER,
          },
        })
      })
    }, 'sessionStatus.clientConfig')

    if (this.config.autoInfer) {
      this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
        void this.#observe(session, event).catch((error: unknown) => {
          this.ctx.logger.warn('sessionStatus: inference failed:', error)
        })
      }, { global: true })
    }
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

  // ---- durable writes ------------------------------------------------------

  /** Insert or replace one mark. `source` distinguishes explicit intent from inference. */
  async putMark(row: MarkRecord): Promise<void> {
    await this.#table().put(row.sessionId, row)
  }

  /** Remove one mark. Returns whether a row existed. */
  async clearMark(sessionId: string): Promise<boolean> {
    return await this.#table().delete(sessionId)
  }

  /** Build an explicit (user- or tool-driven) row. */
  explicitRow(sessionId: string, status: StatusEnum, note: string | null, subjectId: string | null): MarkRecord {
    return {
      version: MARK_VERSION,
      insertedAtMs: Date.now(),
      seq: 0,
      sessionId,
      status,
      source: 'manual',
      subjectId,
      autoReason: null,
      note,
    }
  }

  /** Validate a note against the deployed limit instead of hardcoding a value. */
  #checkedNote(note: string | null): string | null {
    if (note === null) return null
    if (note.length > this.config.maxNoteLength) {
      throw new Error(`sessionStatus: note exceeds maxNoteLength (${this.config.maxNoteLength})`)
    }
    return note
  }

  // ---- read-only inference -------------------------------------------------

  async #observe(session: Session, event: SessionEvent): Promise<void> {
    const proposed = inferStatus({ type: event.type, seq: event.seq, time: event.time, data: event.data })
    if (proposed === null) return
    const current = await this.effectiveMark(session.id)
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
    }
    await this.putMark(row)
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
    const marks: MarkRecord[] = []
    for (const [, row] of this.listAll()) marks.push(row)
    const revision = marksRevision(marks)
    const since = new URL(request.url).searchParams.get('since')
    const refreshIntervalMs = this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    if (since !== null && since === revision) {
      return Response.json({ marks: [], refreshIntervalMs, revision, unchanged: true })
    }
    return Response.json({ marks, refreshIntervalMs, revision, unchanged: false })
  }

  /**
   * Group every mark by status and join each with its session title. Only
   * non-empty groups are returned, in `STATUS_VALUES` order; group members are
   * sorted by `updatedAtMs` descending. Titles come from the session-title
   * projection; a missing session or a throwing title read yields `null`.
   */
  async #handleOverview(): Promise<Response> {
    const sessions = new Map<string, Session>()
    try {
      for (const session of this.ctx.sessions.list()) sessions.set(session.id, session)
    } catch { /* sessions unavailable — every title falls back to null */ }

    const byStatus = new Map<StatusEnum, OverviewEntry[]>()
    let totalMarked = 0
    for (const [, row] of this.listAll()) {
      let title: string | null = null
      const session = sessions.get(row.sessionId)
      if (session !== undefined) {
        try { title = this.ctx.sessionTitle.get(session)?.title ?? null } catch { title = null }
      }
      const entry: OverviewEntry = {
        sessionId: row.sessionId,
        title,
        status: row.status,
        note: row.note,
        source: row.source,
        autoReason: row.autoReason,
        updatedAtMs: row.insertedAtMs,
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
    return Response.json({
      groups,
      totalMarked,
      refreshIntervalMs: this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS,
    })
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
      const row = this.explicitRow(parsed.data.sessionId, parsed.data.status, this.#checkedNote(parsed.data.note), parsed.data.subjectId)
      await this.putMark(row)
      return Response.json({ ok: true, sessionId: row.sessionId, mark: row })
    }

    return Response.json({ ok: false, code: 'unsupported-action', message: String(action) }, { status: 400 })
  }

  // ---- AI tools ------------------------------------------------------------

  #buildSetTool() {
    const service = this
    return defineTool({
      name: 'set_session_status',
      description: [
        'Set an explicit status label on the current session so the session list shows where it stands.',
        'WHEN TO USE: the conversation reaches a state another person needs to see in the session list, such as waiting on the user, a subagent still running, work blocked, or a task genuinely finished.',
        'WHEN NOT TO USE: Do not mark a normally finished session done automatically. A turn ending only means this reply finished; it does not mean the user goal is complete. Leave done to a deliberate user request or your own confirmed judgement.',
        'DO NOT USE FOR: do not use this tool to record intermediate tool progress or an inference you are guessing at. Automatic inference never overwrites a manual mark or a mark made with this tool, and a later call to this tool replaces an earlier mark of either kind.',
        'USAGE: pass one status from todo, done, stopped, blocked, review, pending-subagent, awaiting-answer, feedback. Statuses written by you through this tool are manual. Add a short note when the reason is not obvious, and a subjectId when the mark refers to a specific turn, goal, job, or subagent.',
        'EXAMPLES: user asks you to pause and wait for their answer, call with status awaiting-answer and a note naming what you need. A subagent is launched and still running, call with status pending-subagent and its id as subjectId. Work is genuinely complete and confirmed, call with status done. To remove an incorrect mark, use clear_session_status instead of this tool.',
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
        const row = service.explicitRow(sessionId, args.status, note, args.subjectId ?? null)
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
    if (this.#domain === undefined) throw new Error('sessionStatus: storage domain is not open')
    return this.#domain.table(MARKER_TABLE_NAME)
  }
}

/** Resolve the caller's session id without hardcoding an agent-tree assumption. */
function agentSessionId(exec: { readonly agent?: { readonly id: string } | undefined }): string {
  const id = exec.agent?.id
  if (id === undefined) throw new Error('sessionStatus: this tool requires an active agent session')
  return id
}

export default SessionStatusService
