/** @module Icon glyphs rendered inside the Browser bundle.
 *
 * Each entry is an inline SVG string sourced from the DSH product icon set
 * (`ui-primitives/src/icons/artwork.ts`). They are hand-selected for status
 * semantics and hardcoded here so the bundle does not need runtime access to
 * the full artwork table. Colors flow via `currentColor`.
 *
 * Every glyph is built through {@link glyph} so the box is always explicit:
 * an inline `<svg>` without `width`/`height` has no intrinsic size and lays
 * out at 0x0 inside the badge, which ships an invisible indicator. Declaring
 * the size on the root element keeps the contract testable without a browser.
 */

import type { MarkIconKey } from '../contracts.js'

const GLYPH_SIZE = 16

/** Wraps glyph body markup in a sized, presentational `<svg>` root. */
function glyph(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_SIZE}" height="${GLYPH_SIZE}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none">${body}</svg>`
}

export const ICON_CHECKLIST = glyph(
  '<g stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.75" cy="4.5" r="1.75"></circle><path d="M7.5 4.5h6"></path><circle cx="3.75" cy="11.5" r="1.75"></circle><path d="M7.5 11.5h6"></path></g>',
)

export const ICON_CHECK_CIRCLE = glyph(
  '<g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8l3.5 3.5 6-6"></path><circle cx="8" cy="8" r="6"></circle></g>',
)

export const ICON_STOP = glyph('<rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"></rect>')

export const ICON_WARNING = glyph(
  '<g stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5l6.5 11H1.5L8 1.5z"></path><path d="M8 6v3"></path><circle cx="8" cy="11" r=".75" fill="currentColor" stroke="none"></circle></g>',
)

export const ICON_REVIEW = glyph(
  '<g stroke="currentColor" stroke-width="1"><rect x="2" y="2" width="12" height="12" rx="2"></rect><path d="M5 6h6M5 9h4"></path></g>',
)

export const ICON_SUBAGENT = glyph(
  '<g stroke="currentColor" stroke-width="1"><circle cx="5" cy="5" r="2.5"></circle><circle cx="11" cy="5" r="2.5"></circle><circle cx="5" cy="11" r="2.5"></circle><path d="M8 5h1M5.8 7.2l1.4 1.4M10.2 7.2l-1.4 1.4"></path></g>',
)

export const ICON_PAUSE = glyph(
  '<g stroke="currentColor" stroke-width="1"><circle cx="8" cy="8" r="6"></circle><rect x="6" y="5" width="1.5" height="6" rx=".5" fill="currentColor" stroke="none"></rect><rect x="8.5" y="5" width="1.5" height="6" rx=".5" fill="currentColor" stroke="none"></rect></g>',
)

export const ICON_FEEDBACK = glyph(
  '<g stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4H4a2 2 0 00-2 2v5a2 2 0 002 2h1"></path><path d="M12 8l3-3v6l-3-3z" fill="currentColor" stroke="none"></path></g>',
)

/** Glyph size in CSS pixels; must match the `.badge` / `.cell` box. */
export const ICON_PIXEL_SIZE = GLYPH_SIZE

/** Glyph ids carried by this bundle; every {@link StatusMeta.icon} must appear here. */
export const ICONS: Readonly<Record<MarkIconKey, string>> = {
  'checklist-outline': ICON_CHECKLIST,
  'check-circle-fill': ICON_CHECK_CIRCLE,
  'stop-fill': ICON_STOP,
  'warning-triangle-outline': ICON_WARNING,
  'browse-outline': ICON_REVIEW,
  'agent-preset-outline': ICON_SUBAGENT,
  'pause-outline': ICON_PAUSE,
  'like-outline': ICON_FEEDBACK,
}
