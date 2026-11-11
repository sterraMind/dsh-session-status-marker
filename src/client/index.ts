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
import { NS, DICTIONARIES } from './locales.js'
import type { MarkerKey } from './locales.js'

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
}
