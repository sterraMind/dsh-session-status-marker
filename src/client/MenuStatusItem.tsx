/** @module Row-menu entry carrying the status action on touch and keyboard devices.
 *
 * The host hides `sidebar.workspaces.session.row.action` under
 * `@media (hover: none)` (`ui-workspace/src/client/contract/slots.ts:206-211`),
 * and the hover card never opens for a touch pointer
 * (`ui-primitives/src/HoverCard.tsx:326-327` returns early unless the pointer
 * type is a hovering mouse). This `role="menuitem"` entry is therefore the only
 * touch channel: it shows the current mark, its note, the eight statuses and a
 * clear action, all inside the host menu surface.
 *
 * The row anatomy copies the official MenuRow so the entry lines up with the
 * built-in Pin and Archive rows instead of inventing its own metrics
 * (`ui-primitives/src/MenuRow.tsx:48-49`, `Menu.module.css:178-193,254-279`:
 * a 14px icon column, a 6px gap, 6px/8px padding, 13px/20px text).
 */

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { STATUS_META } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'
import { StatusPicker } from './StatusPicker.js'

/** Props of the row-menu entry: owner session, translator and the menu open-state hook. */
export type MenuStatusProps = PropsRuntime<'sidebar.workspaces.session.menu.item'> & PropsLocale<typeof NS>

/** Icon fallback for an unmarked session: the same checklist glyph the `todo` status uses. */
const FALLBACK_ICON = 'checklist-outline' as const

/** Row-menu entry that expands the full status panel for touch and keyboard users. */
export function MenuStatusItem({ sessionId, t, useMenuOpenState }: MenuStatusProps) {
  const [expanded, setExpanded] = useState(false)
  const [, setMenuOpen] = useMenuOpenState()
  const { mark } = useMark(sessionId)

  /** Stop clicks and keys from reaching the shared menu's own handlers. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  const icon = mark === null ? FALLBACK_ICON : STATUS_META[mark.status].icon

  return (
    <span className={css.menuItem} role="none" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        role="menuitem"
        className={css.menuTrigger}
        aria-expanded={expanded}
        onClick={() => { setExpanded((value) => !value) }}
      >
        <span
          className={css.menuIcon}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ICONS[icon] ?? '' }}
        />
        <span className={css.menuLabel}>{t('menu.setStatus')}</span>
      </button>
      {expanded && (
        <span className={css.menuPanel} role="group">
          <StatusPicker
            sessionId={sessionId}
            t={t}
            itemRole="menuitem"
            showSummary
            onPicked={() => { setExpanded(false); setMenuOpen(false) }}
          />
        </span>
      )}
    </span>
  )
}
