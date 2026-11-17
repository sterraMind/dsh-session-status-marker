/** @module Client entry for dsh-session-status-marker.
 *
 * Registers the locale namespace and two slot occupants:
 *  - `sidebar.session.row.trailing` → SessionStatusBadge
 *  - `sidebar.session.row.hover`   → SessionStatusHover
 *
 * Follows `.research/dsh-repo/packages/client/ui-deliverables/src/client/index.ts:38-64`.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { SessionStatusBadge } from './Badge.js'
import { SessionStatusHover } from './HoverCard.js'
import { StatusOverview } from './StatusOverview.js'
import type { StatusOverviewInjected } from './StatusOverview.js'
import { NS, DICTIONARIES } from './locales.js'
import type { MarkerKey } from './locales.js'
import { MARKER_OVERVIEW_ROUTE } from '../contracts.js'
import type { OverviewResponse } from '../contracts.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-row status badge and hover-card copy. */
    'sessionStatus.marker': MarkerKey
  }
}

/** Required services for the dictionaries and the two slot registrations. */
export const inject = ['slots', 'locale']

/** Client plugin body: register dictionaries and the two slot occupants. */
export function apply(ctx: ClientContext): void {
  // Ship every language the shell offers (`locale/src/client/index.ts:23` lists
  // en, ja, es, fr, de, ru, pt, zh). Registering only zh/en made the six others
  // fall back to English, which read as "the language never switches".
  ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'sessionStatus.marker: dictionaries')

  ctx.slots.inject('sidebar.session.row.trailing', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.trailing',
        id: 'session-status-badge',
        order: 50,
        locale: NS,
      },
      SessionStatusBadge,
    ),
  )

  ctx.slots.inject('sidebar.session.row.hover', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.hover',
        id: 'session-status-hover',
        order: 10,
        locale: NS,
      },
      SessionStatusHover,
    ),
  )

  // Status-overview settings page: one read-only section grouping every marked
  // session by status. Data arrives through `fetchOverview`; copy through the
  // bound `t` (fresh on every locale switch, so the nav label stays current).
  const t = ctx.locale.bind(NS) as (key: string, params?: Record<string, string>) => string
  const fetchOverview = async (): Promise<OverviewResponse> => {
    const resp = await fetch(MARKER_OVERVIEW_ROUTE)
    if (!resp.ok) throw new Error('overview fetch failed')
    return (await resp.json()) as OverviewResponse
  }
  const overviewInjected = (): StatusOverviewInjected => ({ t, fetchOverview })
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'session-status',
        order: 60,
        label: () => t('overview.nav'),
        inject: overviewInjected,
      },
      StatusOverview,
    ),
  )
}
