/** @module Client entry for dsh-session-status-marker.
 *
 * Registers the locale namespace and four slot occupants:
 *  - `sidebar.session.row.trailing` → SessionStatusBadge
 *  - `sidebar.session.row.hover`   → SessionStatusHover
 *  - `sidebar.workspaces.session.row.action` → SessionStatusRowAction (order 300)
 *  - `sidebar.workspaces.session.menu.item`  → MenuStatusItem (touch/keyboard fallback)
 *
 * Follows `.research/dsh-repo/packages/client/ui-deliverables/src/client/index.ts:38-64`.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { SessionStatusBadge } from './Badge.js'
import { SessionStatusHover } from './HoverCard.js'
import { SessionStatusRowAction } from './RowAction.js'
import { MenuStatusItem } from './MenuStatusItem.js'
import { StatusOverview } from './StatusOverview.js'
import type { StatusOverviewInjected } from './StatusOverview.js'
import { NS, DICTIONARIES } from './locales.js'
import type { MarkerKey } from './locales.js'
import { MARKER_OVERVIEW_PATH, CLIENT_CONFIG_GLOBAL } from '../contracts.js'
import type { OverviewResponse } from '../contracts.js'
import { DEFAULT_ROW_ACTION_ORDER, DEFAULT_MENU_ITEM_ORDER, OVERVIEW_FETCH_TIMEOUT_MS } from '../contracts.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-row status badge and hover-card copy. */
    'sessionStatus.marker': MarkerKey
  }
}

/** Slot orders injected by the Host through `webserver/index-inject`. */
interface BrowserConfig {
  rowActionOrder?: number
  menuItemOrder?: number
}

/** Required services for the dictionaries and the four slot registrations. */
export const inject = ['slots', 'locale']

/** Client plugin body: register dictionaries and the four slot occupants. */
export function apply(ctx: ClientContext): void {
  // The dynamic client row carries no config, so read the orders the Host
  // injected as a page global (official `webserver/index-inject` pattern).
  // Missing or malformed values fall back to the documented defaults.
  const browserConfig = (globalThis as { [CLIENT_CONFIG_GLOBAL]?: BrowserConfig })[CLIENT_CONFIG_GLOBAL] ?? {}
  const rowActionOrder = typeof browserConfig.rowActionOrder === 'number' ? browserConfig.rowActionOrder : DEFAULT_ROW_ACTION_ORDER
  const menuItemOrder = typeof browserConfig.menuItemOrder === 'number' ? browserConfig.menuItemOrder : DEFAULT_MENU_ITEM_ORDER
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

  // Non-hover entry points. ui-workspace registers archive (100) and pin (200)
  // in row.action; 300 places this status button after both. The same picker is
  // contributed to the row menu because the host hides row.action under
  // `@media (hover: none)`, which is the touch device case.
  ctx.slots.inject('sidebar.workspaces.session.row.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.row.action',
        id: 'session-status-row-action',
        order: rowActionOrder,
        locale: NS,
      },
      SessionStatusRowAction,
    ),
  )

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'session-status-menu-item',
        order: menuItemOrder,
        locale: NS,
      },
      MenuStatusItem,
    ),
  )

  // Status-overview settings page: one read-only section grouping every marked
  // session by status. Data arrives through `fetchOverview`; copy through the
  // bound `t` (fresh on every locale switch, so the nav label stays current).
  const t = ctx.locale.bind(NS) as (key: string, params?: Record<string, string>) => string
  const fetchOverview = async (since?: string): Promise<OverviewResponse> => {
    // Absolute path: a relative "api/..." resolves against the current route,
    // which changes under the settings panel and produced spurious 404s.
    // `since` asks the Host for a conditional refresh: when the board payload
    // matches this revision the Host answers `unchanged` with a small body, so
    // steady-state polls transfer few bytes and trigger no re-render. An empty
    // `since` (the first poll, or a Host without revisions) requests a full
    // payload.
    const url = since === undefined || since === '' ? MARKER_OVERVIEW_PATH : `${MARKER_OVERVIEW_PATH}?since=${encodeURIComponent(since)}`
    // Abort after a deadline so a hung Host never leaves the board on "loading".
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OVERVIEW_FETCH_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { signal: controller.signal })
      if (!resp.ok) throw new Error('overview fetch failed')
      return (await resp.json()) as OverviewResponse
    } finally {
      clearTimeout(timeout)
    }
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
