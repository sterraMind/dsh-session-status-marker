/** @module Shared eight-status picker for the row action and the row menu entry.
 *
 * Both non-hover entry points render this one component, so the status list,
 * glyphs, colors and the mutation contract stay identical to the hover card
 * without duplicating the transport. {@link setSessionStatus} is the single
 * write path: it posts a manual `set` to the Host route and publishes the
 * returned mark through the shared cache, which repaints every open badge.
 * {@link clearSessionStatus} is its delete counterpart.
 *
 * `showSummary` adds the two lines the hover card shows above the cells — the
 * current mark and its note — plus a clear button. Touch devices never open the
 * hover card (`ui-primitives/src/HoverCard.tsx:326-327` ignores touch pointers),
 * so this panel is where those details stay reachable on a phone.
 */

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { STATUS_VALUES, STATUS_META, MARKER_MUTATE_ROUTE, DEFAULT_MAX_NOTE_LENGTH, MARK_VERSION } from '../contracts.js'
import type { MarkRecord, SetMarkBody, StatusEnum } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { publishLocalMark } from './marks.js'
import { useMark } from './useMark.js'

/** Props of the shared status picker. */
export type StatusPickerProps = PropsLocale<typeof NS> & {
  /** Session the picked status is written to. */
  readonly sessionId: string
  /** Called after a successful write so the host entry can collapse itself. */
  readonly onPicked?: () => void
  /** Set to `menuitem` when the picker sits inside the row context menu. */
  readonly itemRole?: 'menuitem'
  /** Render the current mark, its note and a clear action around the cells. */
  readonly showSummary?: boolean
}

/**
 * POST one manual status change and fan the returned mark out to every subscriber.
 * @param sessionId - Session whose mark is written.
 * @param status - One value from the shared `STATUS_VALUES` list.
 * @returns A promise that resolves after the local cache has been updated.
 */
export async function setSessionStatus(sessionId: string, status: StatusEnum, note: string | null = null): Promise<void> {
  const body: SetMarkBody = { action: 'set', sessionId, status, source: 'manual', note, subjectId: null }
  const response = await fetch(MARKER_MUTATE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('mutation failed')
  const result = (await response.json()) as { mark: MarkRecord | null }
  publishLocalMark(sessionId, result.mark ?? null)
}

/**
 * Collapse a raw note draft to the value sent to the Host.
 *
 * The stored note is trimmed, and an all-whitespace draft becomes `null` so
 * emptying the field clears the note instead of storing blank text.
 * @param note - Raw text from the input, or `null`.
 * @returns The trimmed note, or `null` when nothing is left.
 */
export function normalizeNote(note: string | null): string | null {
  if (note === null) return null
  const trimmed = note.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * POST one manual note change for a session while keeping its current status.
 * @param sessionId - Session whose mark is written.
 * @param status - Status kept on the mark; the caller passes the current one.
 * @param note - New note text, or `null` to clear it.
 * @returns A promise that resolves after the local cache has been updated.
 */
export async function setSessionNote(sessionId: string, status: StatusEnum, note: string | null): Promise<void> {
  const body: SetMarkBody = { action: 'set', sessionId, status, source: 'manual', note: normalizeNote(note), subjectId: null }
  const response = await fetch(MARKER_MUTATE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('mutation failed')
  const result = (await response.json()) as { mark: MarkRecord | null }
  publishLocalMark(sessionId, result.mark ?? null)
}

/**
 * Delete the mark and repaint every subscriber.
 * @param sessionId - Session whose mark is removed.
 * @returns A promise that resolves after the local cache has been updated.
 */
export async function clearSessionStatus(sessionId: string): Promise<void> {
  const response = await fetch(MARKER_MUTATE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clear', sessionId }),
  })
  if (!response.ok) throw new Error('mutation failed')
  const result = (await response.json()) as { deleted: boolean }
  if (result.deleted) publishLocalMark(sessionId, null)
}

/** Eight one-line status cells; clicking a cell writes that status and closes the host entry. */
export function StatusPicker({ sessionId, t, onPicked, itemRole, showSummary = false }: StatusPickerProps) {
  const { mark, loading } = useMark(sessionId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  /** Keep clicks and keys away from the host row and its hover-card copy handler. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  /**
   * Write one status and close the host entry.
   *
   * The local cache is updated optimistically first so the highlighted cell and
   * every badge repaint on the same frame as the click; the Host response then
   * overwrites it with the authoritative row. A failed write rolls the cache
   * back to the previous mark so the UI does not keep a status the Host never
   * stored.
   */
  function pick(status: StatusEnum): void {
    if (busy) return
    const previous = mark
    setBusy(true)
    setError(null)
    publishLocalMark(sessionId, {
      version: MARK_VERSION,
      insertedAtMs: Date.now(),
      seq: 0,
      sessionId,
      status,
      source: 'manual',
      subjectId: null,
      autoReason: null,
      note: previous?.note ?? null,
    })
    setSessionStatus(sessionId, status, previous?.note ?? null).then(
      () => { setBusy(false); onPicked?.() },
      () => { publishLocalMark(sessionId, previous); setBusy(false); setError(t('action.error')) },
    )
  }

  function clear(): void {
    if (busy) return
    setBusy(true)
    setError(null)
    clearSessionStatus(sessionId).then(
      () => { setBusy(false); onPicked?.() },
      () => { setBusy(false); setError(t('action.error')) },
    )
  }

  /** Open the note editor seeded with the current note. */
  function startEdit(): void {
    if (busy) return
    setDraft(mark?.note ?? '')
    setError(null)
    setEditing(true)
  }

  /** Close the note editor without writing. */
  function cancelEdit(): void {
    setEditing(false)
    setError(null)
  }

  /** Write the draft note, keeping the current status (or `todo` when unmarked). */
  function saveNote(): void {
    if (busy) return
    setBusy(true)
    setError(null)
    setSessionNote(sessionId, mark?.status ?? 'todo', draft).then(
      () => { setBusy(false); setEditing(false); onPicked?.() },
      () => { setBusy(false); setError(t('hover.error')) },
    )
  }

  if (error !== null) {
    return <span className={css.pickerError} role="status" onClick={stop} onKeyDown={stop}>{error}</span>
  }

  /** Same wording the hover card uses, so both surfaces describe a mark identically. */
  const summary = !showSummary ? null : loading
    ? t('hover.loading')
    : mark === null
      ? t('hover.empty')
      : mark.source === 'auto'
        ? t('hover.auto', { status: t(STATUS_META[mark.status].labelKey), reason: mark.autoReason ?? '' })
        : mark.source === 'agent'
          ? t('hover.agent', { status: t(STATUS_META[mark.status].labelKey) })
          : t('hover.manual', { status: t(STATUS_META[mark.status].labelKey) })

  return (
    <span className={showSummary ? css.panel : undefined} onClick={stop} onKeyDown={stop}>
      {summary !== null && <span className={css.panelSummary}>{summary}</span>}
      {showSummary && mark?.note && (
        <span className={css.panelNote}>{t('hover.note', { note: mark.note.slice(0, 64) })}</span>
      )}
      <span
        className={css.grid}
        role={itemRole === 'menuitem' ? 'menu' : undefined}
        onClick={stop}
        onKeyDown={stop}
      >
        {STATUS_VALUES.map((status) => {
          const meta = STATUS_META[status]
          const active = status === mark?.status
          return (
            <button
              key={status}
              type="button"
              role={itemRole}
              className={[css.cell, active && css.active].filter(Boolean).join(' ')}
              title={t(meta.labelKey)}
              aria-label={t(meta.labelKey)}
              aria-pressed={active}
              disabled={busy}
              style={{ color: meta.hoverTone }}
              onClick={() => { pick(status) }}
            >
              <span className={css.iconCell} dangerouslySetInnerHTML={{ __html: ICONS[meta.icon] ?? '' }} />
            </button>
          )
        })}
      </span>
      {showSummary && !editing && (
        <span className={css.panelActions}>
          <button type="button" className={css.editBtn} disabled={busy} onClick={startEdit}>{t('hover.noteEdit')}</button>
          {mark !== null && (
            <button type="button" className={css.clearBtn} disabled={busy} onClick={clear}>{t('hover.clearBtn')}</button>
          )}
        </span>
      )}
      {showSummary && editing && (
        <span className={css.noteEditor}>
          <input
            type="text"
            className={css.noteInput}
            value={draft}
            maxLength={DEFAULT_MAX_NOTE_LENGTH}
            placeholder={t('hover.noteEdit')}
            aria-label={t('hover.noteEdit')}
            disabled={busy}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                saveNote()
              }
            }}
          />
          <button type="button" className={css.saveBtn} disabled={busy} onClick={saveNote}>{t('hover.noteSave')}</button>
          <button type="button" className={css.cancelBtn} disabled={busy} onClick={cancelEdit}>{t('hover.noteCancel')}</button>
        </span>
      )}
    </span>
  )
}
