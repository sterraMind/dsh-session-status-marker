/** @module Native capture-phase guard that disables the hover card's copy-on-click.
 *
 * The host registers the whole hover card as `role="button"` and copies the
 * session title from a card-level React `onClick`
 * (`ui-primitives/src/HoverCard.tsx:293-303`) and from Enter/Space
 * `onKeyDown` (`:304-310`). Only clicks inside our slot subtree are stopped by
 * our own `stopPropagation` handlers; clicks on the card's other areas (title,
 * path, time, status lines) bubble to the card root and copy — the "已复制"
 * feedback the user reported (m05056). The host offers no prop to disable
 * `copyText` for a row, so the plugin stops the event earlier in the pipeline:
 * React 17+ replays synthetic events from listeners attached to the root
 * container element, and a native `capture` listener on `document` (an
 * ancestor of that container) fires first, so `stopPropagation()` there
 * prevents the React handler from ever running.
 *
 * Scope rules inside the listener:
 * - Only events whose target sits inside a hover card (`[class*='card']`)
 *   that also contains our slot (`[data-status-slot]`) are stopped, so every
 *   other surface in the app keeps its normal click behavior.
 * - Targets inside our slot keep bubbling: our slot's React handlers rely on
 *   receiving clicks (status cells write, buttons toggle), and our own
 *   `stopPropagation` handlers already shield the host row.
 * - Interactive elements (buttons, inputs, textareas, links, anything with a
 *   `disabled` state) are never blocked, so form controls and future host
 *   widgets inside the card stay usable.
 * - Text selection: the host's own handler refuses to copy when a selection
 *   intersects the card; we do not call `preventDefault()`, so selecting and
 *   copying text from the card keeps working through the browser defaults.
 */

import { useEffect } from 'react'

/** Anchor attribute our slot roots carry; marks "inside our slot". */
const SLOT_ANCHOR = 'data-status-slot'

/** Selector matching the host hover-card portal root by hashed-class substring. */
const CARD_MATCH = '[class*=\'card\']'

/** Elements whose clicks must reach their own handlers even inside the card. */
const INTERACTIVE = 'button, input, textarea, select, a[href], [contenteditable]'

/** True when the click target is inside the host card but outside our slot and not interactive. */
function shouldBlock(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false
  const card = target.closest(CARD_MATCH)
  if (card === null || card.querySelector(`[${SLOT_ANCHOR}]`) === null) return false
  if (target.closest(`[${SLOT_ANCHOR}]`) !== null) return false
  if (target.closest(INTERACTIVE) !== null) return false
  return true
}

/** Listener shared by the click and keydown registrations. */
function guard(event: Event): void {
  // Keyboard: the card copies on Enter/Space only (`HoverCard.tsx:304-310`);
  // blocking every key would break focus travel (Tab) and scrolling.
  if (event.type === 'keydown') {
    const key = (event as KeyboardEvent).key
    if (key !== 'Enter' && key !== ' ') return
  }
  if (!shouldBlock(event.target)) return
  // Native-level stop: the event never reaches the React root container, so
  // the card's copy onClick/onKeyDown never runs. preventDefault is left out
  // so text selection and scrolling keep their browser defaults.
  event.stopPropagation()
}

/**
 * While a Session hover slot is mounted, swallow clicks and Enter/Space keys
 * on the host card's non-interactive areas so the card stops copying its
 * title. The listeners live for the slot's lifetime and are removed on unmount.
 */
export function useCardCopyGuard(): void {
  useEffect(() => {
    document.addEventListener('click', guard, true)
    document.addEventListener('keydown', guard, true)
    return () => {
      document.removeEventListener('click', guard, true)
      document.removeEventListener('keydown', guard, true)
    }
  }, [])
}
