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

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './hover.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { STATUS_VALUES, STATUS_META, MARKER_MUTATE_ROUTE } from '../contracts.js'
import type { MarkRecord, StatusEnum } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'
import { publishLocalMark } from './marks.js'
import { useCardCopyGuard } from './copyGuard.js'

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
  useCardCopyGuard()
  const { mark, loading } = useMark(sessionId)
  const [error, setError] = useState<string | null>(null)

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

  /** Stop pointer and keyboard events from reaching the card's copy handler. */
  function stop(event: SyntheticEvent) {
    event.stopPropagation()
  }

  /** Spread onto every interactive root so the card never reports "已复制". */
  const guard = { onClick: stop, onKeyDown: stop }
  /** Anchors the host-card theme takeover in hover.module.css (`:has` selector). */
  const slotAnchor = { 'data-status-slot': '' } as const

  if (loading) return <div className={css.root} data-mark="loading" {...slotAnchor} {...guard}>{t('hover.loading')}</div>
  if (error) return <div className={css.root} data-mark="error" {...slotAnchor} {...guard}>{error}</div>

  const meta = mark ? STATUS_META[mark.status] : null
  // The eight cells stay visible for marked and unmarked sessions alike. Making
  // the user open a picker first added a step to every change; showing the cells
  // directly lets one click switch status, and the active cell marks the current
  // one. The heading below doubles as the label the change button used to carry.
  return (
    <div className={css.root} data-mark={mark ? 'present' : 'absent'} {...slotAnchor} {...guard}>
      <div className={css.label}>
        {mark === null
          ? t('hover.empty')
          : mark.source === 'auto'
            ? t('hover.auto', { status: t(meta!.labelKey), reason: mark.autoReason ?? '' })
            : t('hover.manual', { status: t(meta!.labelKey) })}
      </div>
      {mark?.note && <div className={css.note}>{t('hover.note', { note: mark.note.slice(0, 64) })}</div>}
      <div className={css.grid}>
        {STATUS_VALUES.map((s) => {
          const m = STATUS_META[s]
          const active = s === mark?.status
          return (
            <button
              key={s}
              className={[css.cell, active && css.active].filter(Boolean).join(' ')}
              title={t(m.labelKey)}
              aria-label={t(m.labelKey)}
              aria-pressed={active}
              style={{ color: m.hoverTone }}
              onClick={() => { void handleSet(s, null) }}
            >
              <span className={css.iconCell} dangerouslySetInnerHTML={{ __html: ICONS[m.icon] ?? '' }} />
            </button>
          )
        })}
      </div>
      {mark && <div className={css.actions}><button className={css.clearBtn} onClick={() => void handleClear()}>{t('hover.clearBtn')}</button></div>}
    </div>
  )
}
