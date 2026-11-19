/** @module Row-menu entry carrying the status action on touch and keyboard devices.
 *
 * The host hides `sidebar.workspaces.session.row.action` under
 * `@media (hover: none)`, so this `role="menuitem"` entry offers the same eight
 * statuses from the row context menu. Expanding keeps the menu open; a successful
 * pick dismisses it through the hook the slot owner supplies.
 */

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { NS } from './locales.js'
import { StatusPicker } from './StatusPicker.js'

/** Props of the row-menu entry: owner session, translator and the menu open-state hook. */
export type MenuStatusProps = PropsRuntime<'sidebar.workspaces.session.menu.item'> & PropsLocale<typeof NS>

/** Row-menu entry that expands the same eight-status picker as the row action. */
export function MenuStatusItem({ sessionId, t, useMenuOpenState }: MenuStatusProps) {
  const [expanded, setExpanded] = useState(false)
  const [, setMenuOpen] = useMenuOpenState()

  /** Stop clicks and keys from reaching the shared menu's own handlers. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  return (
    <span className={css.menuItem} role="none" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        role="menuitem"
        className={css.menuTrigger}
        aria-expanded={expanded}
        onClick={() => { setExpanded((value) => !value) }}
      >
        {t('menu.setStatus')}
      </button>
      {expanded && (
        <span className={css.menuPicker} role="menu">
          <StatusPicker
            sessionId={sessionId}
            t={t}
            itemRole="menuitem"
            onPicked={() => { setExpanded(false); setMenuOpen(false) }}
          />
        </span>
      )}
    </span>
  )
}
