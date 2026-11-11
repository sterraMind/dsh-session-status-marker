/** @module Status-badge component rendered inside `sidebar.session.row.trailing`.
 *
 * Shows an official-style inline SVG whose color flows via theme tokens (never
 * hardcoded). The mark comes from the shared subscription in `./marks.ts`, so a
 * mark written by the model, by another window, or by this window's hover card
 * appears without reloading the page.
 */

import css from './badge.module.css'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { STATUS_META } from '../contracts.js'
import { NS } from './locales.js'
import { ICONS } from './icons.js'
import { useMark } from './useMark.js'

export type BadgeProps = PropsRuntime<'sidebar.session.row.trailing'> & PropsLocale<typeof NS>

export function SessionStatusBadge({ sessionId, t }: BadgeProps) {
  const { mark, loading } = useMark(sessionId)

  const meta = mark ? STATUS_META[mark.status] : null
  const svg = meta ? ICONS[meta.icon] : null
  const label = mark ? t(meta!.labelKey) : null

  return (
    <span
      className={css.badge}
      style={{ color: meta?.tone ?? 'var(--dsw-alias-label-muted)' }}
      title={label ?? undefined}
      aria-label={t('badge.aria')}
      data-status={mark?.status}
    >
      {svg
        ? <span className={css.glyph} dangerouslySetInnerHTML={{ __html: svg }} />
        : loading
          ? <span className={css.glyph} aria-hidden="true">·</span>
          : null}
      {!mark && !loading && <span className={css.visuallyHidden}>{t('hover.empty')}</span>}
    </span>
  )
}
