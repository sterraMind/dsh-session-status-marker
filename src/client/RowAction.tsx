/** @module Always-mounted status button in `sidebar.workspaces.session.row.action`.
 *
 * The official archive (100) and pin (200) entries occupy the same strip; this
 * entry uses order 300 so it follows both. The host hides the strip on hoverless
 * devices, so `MenuStatusItem` carries the same action into the row menu.
 *
 * The trigger copies the host's own 24px icon button anatomy
 * (`ui-workspace/src/client/rows/Rows.module.css:453-470`) and shows the
 * session's current status glyph — never a text label — so it reads as the
 * same kind of control as the built-in More button.
 *
 * One surface at a time: the row-menu item and the floating picker below only
 * open when the host hover card is NOT showing (the hover card mounts our slot
 * only while it is open, `contract/slots.ts:160-163`). Clicking the trigger
 * while the hover card is visible does nothing, so the user never sees two
 * floating panels over one row — the hover card is the single surface on a
 * hovered row, and this picker is the fallback for keyboard/touch flows where
 * the card cannot open.
 */

import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { NS } from './locales.js'
import { STATUS_META } from '../contracts.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'
import { StatusPicker } from './StatusPicker.js'

/** Props of the row-end status button: owner session id and the bound translator. */
export type RowActionProps = PropsRuntime<'sidebar.workspaces.session.row.action'> & PropsLocale<typeof NS>

/** Icon fallback for an unmarked session: the same checklist glyph the `todo` status uses. */
const FALLBACK_ICON = 'checklist-outline' as const

/** Selector for our hover-card slot anchor; the card mounts it only while open. */
const SLOT_SELECTOR = '[data-status-slot]'

/** True while the host hover card for any row is open (our hover slot mounted). */
function hoverCardOpen(): boolean {
  return document.querySelector(SLOT_SELECTOR) !== null
}

/**
 * Track whether the host hover card is currently showing, by watching for the
 * slot anchor entering or leaving the document (mount/unmount of the hover
 * slot). Returns a React state mirror so the picker collapses as soon as the
 * card appears.
 */
function useHoverCardOpen(): boolean {
  const [open, setOpen] = useState(hoverCardOpen)
  useEffect(() => {
    const update = (): void => { setOpen(hoverCardOpen()) }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    update()
    return () => { observer.disconnect() }
  }, [])
  return open
}

/** Row-end entry that opens the floating status panel without any hover requirement. */
export function SessionStatusRowAction({ sessionId, t }: RowActionProps) {
  const [expanded, setExpanded] = useState(false)
  const cardOpen = useHoverCardOpen()
  const { mark } = useMark(sessionId)

  /** Stop clicks and keys from reaching the host row or its copy handler. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  /** The hover card is the single surface while it is open; the picker yields. */
  const showPicker = expanded && !cardOpen

  const icon = mark === null ? FALLBACK_ICON : STATUS_META[mark.status].icon

  return (
    <span className={css.rowAction} onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('action.aria')}
        aria-expanded={showPicker}
        title={t('action.aria')}
        onClick={() => { if (!cardOpen) setExpanded((value) => !value) }}
      >
        <span className={css.triggerIcon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[icon] ?? '' }} />
      </button>
      {showPicker && (
        <span className={css.popover} role="group">
          <StatusPicker sessionId={sessionId} t={t} showSummary onPicked={() => { setExpanded(false) }} />
        </span>
      )}
    </span>
  )
}
