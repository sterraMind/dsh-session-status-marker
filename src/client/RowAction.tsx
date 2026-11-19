/** @module Always-mounted status button in `sidebar.workspaces.session.row.action`.
 *
 * The official archive (100) and pin (200) entries occupy the same strip; this
 * entry uses order 300 so it follows both. The host hides the strip on hoverless
 * devices, so `MenuStatusItem` carries the same action into the row menu.
 */

import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import css from './action.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { NS } from './locales.js'
import { StatusPicker } from './StatusPicker.js'

/** Props of the row-end status button: owner session id and the bound translator. */
export type RowActionProps = PropsRuntime<'sidebar.workspaces.session.row.action'> & PropsLocale<typeof NS>

/** Row-end entry that expands the eight-status picker without any hover requirement. */
export function SessionStatusRowAction({ sessionId, t }: RowActionProps) {
  const [expanded, setExpanded] = useState(false)

  /** Stop clicks and keys from reaching the host row or its copy handler. */
  function stop(event: SyntheticEvent): void {
    event.stopPropagation()
  }

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
        {t('action.trigger')}
      </button>
      {expanded && (
        <span className={css.popover}>
          <StatusPicker sessionId={sessionId} t={t} onPicked={() => { setExpanded(false) }} />
        </span>
      )}
    </span>
  )
}
