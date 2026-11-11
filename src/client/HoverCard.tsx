/** @module Hover card rendered inside `sidebar.session.row.hover`.
 *
 * Shows the current mark, a quick-status picker, and a clear button. Clicking an
 * item calls the Host's mutation exact route, then writes the result through the
 * shared cache so the sidebar badge updates immediately.
 */

import { useState } from 'react'
import css from './hover.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { STATUS_VALUES, STATUS_META, MARKER_MUTATE_ROUTE } from '../contracts.js'
import type { MarkRecord, StatusEnum } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'
import { publishLocalMark } from './marks.js'

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

export function SessionStatusHover({ sessionId, t }: HoverProps) {
  const { mark, loading } = useMark(sessionId)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  async function handleSet(status: StatusEnum, note: string | null = null) {
    try {
      const res = await postMutate({ action: 'set', sessionId, status, source: 'manual', note, subjectId: null }) as { mark: MarkRecord | null }
      publishLocalMark(sessionId, res.mark ?? null)
    } catch {
      setError(t('hover.error'))
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

  if (loading) return <div className={css.root}>{t('hover.loading')}</div>
  if (error) return <div className={css.root}>{error}</div>

  const meta = mark ? STATUS_META[mark.status] : null
  // A session without a mark gets the picker straight away: hiding it behind the
  // change button left brand-new sessions with no way to be marked manually.
  const showGrid = picking || mark === null
  return (
    <div className={css.root} data-mark={mark ? 'present' : 'absent'}>
      <div className={css.label}>
        {mark === null
          ? t('hover.empty')
          : mark.source === 'auto'
            ? t('hover.auto', { status: t(meta!.labelKey), reason: mark.autoReason ?? '' })
            : t('hover.manual', { status: t(meta!.labelKey) })}
      </div>
      {mark?.note && <div className={css.note}>{t('hover.note', { note: mark.note.slice(0, 64) })}</div>}
      <div className={css.actions}>
        <button className={css.btn} aria-expanded={showGrid} onClick={() => setPicking((v) => !v)}>{t('hover.setBtn')}</button>
        {mark && <button className={css.clearBtn} onClick={handleClear}>{t('hover.clearBtn')}</button>}
      </div>
      {showGrid && (
        <div className={css.grid}>
          {STATUS_VALUES.map((s) => {
            const m = STATUS_META[s]
            const active = s === mark?.status
            return (
              <button
                key={s}
                className={[css.cell, active && css.active].filter(Boolean).join(' ')}
                title={t(m.labelKey)}
                style={{ color: m.hoverTone }}
                onClick={() => { setPicking(false); void handleSet(s, null) }}
              >
                <span className={css.iconCell} dangerouslySetInnerHTML={{ __html: ICONS[m.icon] ?? '' }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
