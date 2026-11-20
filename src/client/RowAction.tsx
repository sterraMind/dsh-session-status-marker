/** @module Always-mounted status button in `sidebar.workspaces.session.row.action`.
 *
 * The official archive (100) and pin (200) entries occupy the same strip; this
 * entry uses order 300 so it follows both. The host hides the strip on hoverless
 * devices, so `MenuStatusItem` carries the same action into the row menu.
 *
 * The trigger copies the host's own 24px icon button anatomy
 * (`ui-workspace/src/client/rows/Rows.module.css:453-470`) and shows the
 * session's current status glyph — never a text label — so it reads as the
 * same kind of control as the built-in More button. The expanded picker opens
 * as a floating card that mirrors the hover card's panel (summary, note, grid,
 * clear), not an inline strip.
 */

import { useState } from 'react'
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

/** Row-end entry that opens the floating status panel without any hover requirement. */
export function SessionStatusRowAction({ sessionId, t }: RowActionProps) {
  const [expanded, setExpanded] = useState(false)
  const { mark } = useMark(sessionId)

  /** Stop clicks and keys from reaching the host row or its copy handler. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

  const icon = mark === null ? FALLBACK_ICON : STATUS_META[mark.status].icon

  return (
    <span className={css.rowAction} onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        className={css.trigger}
        aria-label={t('action.aria')}
        aria-expanded={expanded}
        title={t('action.aria')}
        onClick={() => { setExpanded((value) => !value) }}
      >
        <span className={css.triggerIcon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[icon] ?? '' }} />
      </button>
      {expanded && (
        <span className={css.popover} role="group">
          <StatusPicker sessionId={sessionId} t={t} showSummary onPicked={() => { setExpanded(false) }} />
        </span>
      )}
    </span>
  )
}
