/** @module Always-mounted status glyph in `sidebar.workspaces.session.row.action`.
 *
 * The official archive (100) and pin (200) entries occupy the same strip; this
 * entry uses order 300 so it follows both. The host hides the strip on hoverless
 * devices (`ui-workspace/src/client/rows/Rows.module.css:340-359` hides every
 * quick action that is not the pinned one), so `MenuStatusItem` carries the same
 * action into the row menu for touch and keyboard users.
 *
 * The glyph copies the host's own 24px icon button anatomy
 * (`Rows.module.css:453-470`) and shows the session's current status — never a
 * text label — so it reads as the same kind of control as the built-in More
 * button.
 *
 * This entry owns no floating surface. The session row's hover card is the only
 * place the eight status cells appear, so a row can never show two floating
 * panels at once. The card mounts our slot only while it is open
 * (`contract/slots.ts:160-163`) and opens on the row's own pointer entry, which
 * the strip inherits because the strip sits inside the card anchor.
 *
 * Clicking the glyph keeps that card instead of closing it: the host closes an
 * open card on any click that lands outside its portal
 * (`ui-primitives/src/HoverCard.tsx:343-344` → `dismissFromAnchor`), and the
 * click also reaches the card's own copy handler (`:293-303`). Both listeners
 * sit above this button in the React tree, so a React-level
 * `stopPropagation()` cannot reach them. The capture listener registered on
 * `document` runs before React's root container sees the event, swallows the
 * click, and replays the pointer entry the card listens for (`:326-336`), so the
 * card opens or stays open without a second panel appearing.
 */

import { useEffect } from 'react'
import css from './action.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { NS } from './locales.js'
import { STATUS_META } from '../contracts.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'

/** Props of the row-end status glyph: owner session id and the bound translator. */
export type RowActionProps = PropsRuntime<'sidebar.workspaces.session.row.action'> & PropsLocale<typeof NS>

/** Icon fallback for an unmarked session: the same checklist glyph the `todo` status uses. */
const FALLBACK_ICON = 'checklist-outline' as const

/** Marks the glyph so the capture listener can tell its clicks from the row's. */
const ACTION_ANCHOR = 'data-status-action'

/**
 * Class fragments of the three row containers the workspace renders. Each is a
 * CSS-module class whose generated name keeps the local name as its prefix, so a
 * substring match finds the row that owns the hover card.
 */
const ROW_ANCHORS = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"]'

/**
 * Ask the host hover card to open by replaying the pointer entry it listens for.
 * The card reads `pointerType === 'mouse'` and requires a hover-capable device
 * (`HoverCard.tsx:326-328`), so the synthetic event carries the same pointer
 * type; React synthesizes `onPointerEnter` from this `pointerover`. When the card
 * is already open the handler keeps it open instead of restarting the dwell.
 */
function openRowCard(from: Element): void {
  const row = from.closest(ROW_ANCHORS)
  if (row === null) return
  row.dispatchEvent(new PointerEvent('pointerover', {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerType: 'mouse',
    pointerId: 1,
    isPrimary: true,
    relatedTarget: null,
  }))
}

/**
 * Swallow the glyph's pointer press and click before React dispatches them, then
 * ask the row card to open. Registered on `document` because React binds its
 * listeners to the root container, which sits below `document` in the capture
 * path — a listener on the button itself would run too late to stop the host's
 * own capture handlers.
 */
function useRowCardTrigger(): void {
  useEffect(() => {
    function guard(event: Event): void {
      const target = event.target
      if (!(target instanceof Element)) return
      const glyph = target.closest(`[${ACTION_ANCHOR}]`)
      if (glyph === null) return
      event.stopPropagation()
      if (event.type === 'click') openRowCard(glyph)
    }

    document.addEventListener('pointerdown', guard, true)
    document.addEventListener('click', guard, true)
    return () => {
      document.removeEventListener('pointerdown', guard, true)
      document.removeEventListener('click', guard, true)
    }
  }, [])
}

/** Row-end status glyph that hands every status change to the row hover card. */
export function SessionStatusRowAction({ sessionId, t }: RowActionProps) {
  useRowCardTrigger()
  const { mark } = useMark(sessionId)
  const icon = mark === null ? FALLBACK_ICON : STATUS_META[mark.status].icon

  return (
    <span className={css.rowAction}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('action.aria')}
        title={t('action.aria')}
        {...{ [ACTION_ANCHOR]: '' }}
      >
        <span className={css.triggerIcon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[icon] ?? '' }} />
      </button>
    </span>
  )
}
