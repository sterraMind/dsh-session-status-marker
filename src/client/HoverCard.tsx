/** @module Hover card rendered inside `sidebar.session.row.hover`.
 *
 * Shows the current mark, a quick-status picker, and a clear button. Clicking an
 * item calls the Host's mutation exact route, then writes the result through the
 * shared cache so the sidebar badge updates immediately.
 *
 * Two host contracts shape this component:
 * - DSH's own hover card copies the session title on any click inside the card
 *   (`packages/client/ui-primitives/src/HoverCard.tsx:293-303`) and on Enter or
 *   Space (`:304`). Every interactive surface here stops click and key
 *   propagation, and `useCardCopyGuard` additionally blocks clicks on the
 *   card's non-interactive areas (title, path, time, status lines) at the
 *   native capture phase, so clicking blank space no longer reports "已复制".
 * - The compact hover card spans the eight-pixel anchor gap with a 200 ms pointer
 *   grace and no bridge element (`pointer-grace.ts:8`, `HoverCard.tsx:222-224`),
 *   so a pointer travelling from the row to this content could lose the card on
 *   the way. The stylesheet adds a transparent strip across that gap
 *   (`.root::before`) whose pointer events bubble to the host card's
 *   `onPointerEnter` (`:326-336`), cancelling the pending close.
 */

import { useState, useRef, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import css from './hover.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { STATUS_VALUES, STATUS_META, MARKER_MUTATE_ROUTE, DEFAULT_MAX_NOTE_LENGTH } from '../contracts.js'
import type { MarkRecord, StatusEnum } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'
import { publishLocalMark } from './marks.js'
import { useCardCopyGuard } from './copyGuard.js'
import { useCardEditLock } from './cardLock.js'

export type HoverProps = PropsRuntime<'sidebar.session.row.hover'> & PropsLocale<typeof NS>

async function postMutate(body: unknown): Promise<unknown> {
  const resp = await fetch(MARKER_MUTATE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error('mutation failed')
  return resp.json()
}

/** Trim a note and collapse an empty result to null, matching the Host schema. */
function normalizeNote(note: string): string | null {
  const trimmed = note.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function SessionStatusHover({ sessionId, t }: HoverProps) {
  useCardCopyGuard()
  const { mark, loading } = useMark(sessionId)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A note editor must survive pointer drift and focus-driven group changes.
  // Lock the host card for as long as the editor is open.
  useCardEditLock(editing, sessionId, rootRef)

  // Focus without scrolling: autoFocus lets the browser scroll the portal into
  // view, which moves the host wrapper under an [inert]/[hidden] ancestor and
  // makes `place()` dismiss the card (`ui-primitives/HoverCard.tsx:171-244`).
  useEffect(() => {
    if (editing) inputRef.current?.focus({ preventScroll: true })
  }, [editing])

  async function handleSet(status: StatusEnum, note: string | null) {
    setBusy(true)
    try {
      const res = await postMutate({ action: 'set', sessionId, status, source: 'manual', note, subjectId: null }) as { mark: MarkRecord | null }
      publishLocalMark(sessionId, res.mark ?? null)
      setEditing(false)
    } catch {
      setError(t('hover.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    try {
      const res = await postMutate({ action: 'clear', sessionId }) as { deleted: boolean }
      if (res.deleted) publishLocalMark(sessionId, null)
    } catch {
      setError(t('hover.error'))
    }
  }

  function startEdit() {
    setDraft(mark?.note ?? '')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft('')
  }

  async function saveNote() {
    await handleSet(mark?.status ?? 'todo', normalizeNote(draft))
  }

  /** Stop pointer and keyboard events from reaching the card's copy handler. */
  function stop(event: SyntheticEvent) {
    event.stopPropagation()
  }

  /** Spread onto every interactive root so the card never reports "已复制". */
  const guard = { onClick: stop, onKeyDown: stop }
  /** Anchors the host-card theme takeover in hover.module.css (`:has` selector). */
  const slotAnchor = { 'data-status-slot': '' } as const

  if (loading) return <div ref={rootRef} className={css.root} data-mark="loading" {...slotAnchor} {...guard}>{t('hover.loading')}</div>
  if (error) return <div ref={rootRef} className={css.root} data-mark="error" {...slotAnchor} {...guard}>{error}</div>

  const meta = mark ? STATUS_META[mark.status] : null
  // The eight cells stay visible for marked and unmarked sessions alike. Making
  // the user open a picker first added a step to every change; showing the cells
  // directly lets one click switch status, and the active cell marks the current
  // one. The heading below doubles as the label the change button used to carry.
  // Clicking a cell keeps whatever note the mark already carries, so switching
  // status never silently drops the user's note.
  return (
    <div ref={rootRef} className={css.root} data-mark={mark ? 'present' : 'absent'} {...slotAnchor} {...guard}>
      <div className={css.label}>
        {mark === null
          ? t('hover.empty')
          : mark.source === 'auto'
            ? t('hover.auto', { status: t(meta!.labelKey), reason: mark.autoReason ?? '' })
            : mark.source === 'agent'
              ? t('hover.agent', { status: t(meta!.labelKey) })
              : t('hover.manual', { status: t(meta!.labelKey) })}
      </div>
      {mark?.note && !editing && <div className={css.note}>{t('hover.note', { note: mark.note.slice(0, 64) })}</div>}
      <div className={css.grid}>
        {STATUS_VALUES.map((s) => {
          const m = STATUS_META[s]
          const active = s === mark?.status
          return (
            <Tooltip key={s} label={t(m.labelKey)} side="bottom" delayMs={400}>
              <button
                className={[css.cell, active && css.active].filter(Boolean).join(' ')}
                aria-label={t(m.labelKey)}
                aria-pressed={active}
                style={{ color: m.hoverTone }}
                onClick={() => { void handleSet(s, mark?.note ?? null) }}
              >
                <span className={css.iconCell} dangerouslySetInnerHTML={{ __html: ICONS[m.icon] ?? '' }} />
              </button>
            </Tooltip>
          )
        })}
      </div>
      {editing && (
        <div className={css.noteEditor}>
          <input
            ref={inputRef}
            className={css.noteInput}
            value={draft}
            maxLength={DEFAULT_MAX_NOTE_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              stop(event)
              if (event.key === 'Enter') void saveNote()
              if (event.key === 'Escape') cancelEdit()
            }}
          />
          <button className={css.saveBtn} disabled={busy} onClick={() => void saveNote()}>{t('hover.noteSave')}</button>
          <button className={css.cancelBtn} disabled={busy} onClick={cancelEdit}>{t('hover.noteCancel')}</button>
        </div>
      )}
      {mark && (
        <div className={css.actions}>
          {!editing && <button className={css.editBtn} disabled={busy} onClick={startEdit}>{t('hover.noteEdit')}</button>}
          <button className={css.clearBtn} onClick={() => void handleClear()}>{t('hover.clearBtn')}</button>
        </div>
      )}
    </div>
  )
}
