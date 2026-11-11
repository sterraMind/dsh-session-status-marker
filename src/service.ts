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
import type {} from '@deepseek-ai/dsh-client-connection'
import { MARKER_TABLE_NAME, MarkerDomainSpec, type MarkerDomain } from './domain.js'
import {
  STATUS_VALUES,
  MARK_VERSION,
  DEFAULT_REFRESH_INTERVAL_MS,
  MARKER_STATE_PATH,
  MARKER_LIST_PATH,
  MARKER_MUTATE_PATH,
  SetMarkBodySchema,
  ClearMarkBodySchema,
  type MarkRecord,
  type StatusEnum,
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
}

/** Schemastery schema, consumed by Cordis when this row loads. */
export const Config = z.object({
  autoInfer: z.boolean().required(),
  maxNoteLength: z.natural().min(1).required(),
  autoExpireMs: z.natural().required(),
  refreshIntervalMs: z.natural().min(250).default(DEFAULT_REFRESH_INTERVAL_MS),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionStatus: SessionStatusService
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
  static inject = ['storageDomain', 'tools']

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
      fetch: () => this.#handleList(),
    }
    const mutateRoute = {
      path: MARKER_MUTATE_PATH,
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: (request: Request) => this.#handleMutate(request),
    }
    // The HTTP bridge is injected lazily instead of declared as a dependency:
    // see the note on `inject` above — headless and TUI compositions mount no
    // bridge. `ctx.get('connection')` is not a substitute: a sibling row may
    // still be mounting when this initializer runs, and the undefined result
    // silently drops all three routes (observed on dev4090 as 404 `not found`
    // for every marker path while `/api/changes.summary` answered normally).
    this.ctx.inject(['connection'], (connectionCtx: Context) => {
      connectionCtx.effect(() => {
        const disposeState = connectionCtx.connection.fetch.register(stateRoute)
        const disposeList = connectionCtx.connection.fetch.register(listRoute)
        const disposeMutate = connectionCtx.connection.fetch.register(mutateRoute)
        return () => { void disposeState(); void disposeList(); void disposeMutate() }
      }, 'sessionStatus.fetchRoutes')
    })

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

  async #handleList(): Promise<Response> {
    const marks: MarkRecord[] = []
    for (const [, row] of this.listAll()) marks.push(row)
    return Response.json({ marks, refreshIntervalMs: this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS })
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
      description: 'Mark the current session with an explicit status label (TODO / DONE / STOP / BLOCKED / REVIEW / ...). Call this when the conversation state changes in a way that should be visible in the session list.',
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
