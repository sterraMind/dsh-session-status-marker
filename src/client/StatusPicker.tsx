/** @module Shared eight-status picker for the row action and the row menu entry.
 *
 * Both non-hover entry points render this one component, so the status list,
 * glyphs, colors and the mutation contract stay identical to the hover card
 * without duplicating the transport. {@link setSessionStatus} is the single
 * write path: it posts a manual `set` to the Host route and publishes the
 * returned mark through the shared cache, which repaints every open badge.
 */

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { STATUS_VALUES, STATUS_META, MARKER_MUTATE_ROUTE } from '../contracts.js'
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
}

/**
 * POST one manual status change and fan the returned mark out to every subscriber.
 * @param sessionId - Session whose mark is written.
 * @param status - One value from the shared `STATUS_VALUES` list.
 * @returns A promise that resolves after the local cache has been updated.
 */
export async function setSessionStatus(sessionId: string, status: StatusEnum): Promise<void> {
  const body: SetMarkBody = { action: 'set', sessionId, status, source: 'manual', note: null, subjectId: null }
  const response = await fetch(MARKER_MUTATE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('mutation failed')
  const result = (await response.json()) as { mark: MarkRecord | null }
  publishLocalMark(sessionId, result.mark ?? null)
}

/** Eight one-line status cells; clicking a cell writes that status and closes the host entry. */
export function StatusPicker({ sessionId, t, onPicked, itemRole }: StatusPickerProps) {
  const { mark } = useMark(sessionId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Keep clicks and keys away from the host row and its hover-card copy handler. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  function pick(status: StatusEnum): void {
    if (busy) return
    setBusy(true)
    setError(null)
    setSessionStatus(sessionId, status).then(
      () => { setBusy(false); onPicked?.() },
      () => { setBusy(false); setError(t('action.error')) },
    )
  }

  if (error !== null) {
    return <span className={css.pickerError} role="status" onClick={stop} onKeyDown={stop}>{error}</span>
  }

  return (
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
  )
}
