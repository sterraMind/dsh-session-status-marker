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
 * - Only events whose target sits inside a host card that also contains our
 *   slot are stopped, so every other surface in the app keeps its normal click
 *   behavior. The card is found by walking UP from the target until an ancestor
 *   both matches the card class fragment and contains `[data-status-slot]`;
 *   `closest()` alone used to latch onto the nearest card-ish inner element and
 *   let the click through on the next session after a group switch.
 * - Targets inside our slot keep bubbling: our slot's React handlers rely on
 *   receiving clicks (status cells write, buttons toggle), and our own
 *   `stopPropagation` handlers already shield the host row.
 * - Interactive elements (buttons, inputs, textareas, links, anything with a
 *   `disabled` state) are never blocked, so form controls and future host
 *   widgets inside the card stay usable.
 * - Text selection: the host's own handler refuses to copy when a selection
 *   intersects the card; we do not call `preventDefault()`, so selecting and
 *   copying text from the card keeps working through the browser defaults.
 *
 * Listener lifetime: the handlers are ONE shared pair on `document`, guarded by
 * a module-level ref count. Only the first mount installs them and only the last
 * unmount removes them. A plain per-slot `useEffect` used to let any single slot
 * teardown (a session switch dismisses the previous grouped card) remove the
 * shared listener while the next card still needed it — the window in which
 * clicking the new card reported "已复制" again. `useLayoutEffect` closes the
 * paint-after gap; the ref count closes the cross-session teardown gap.
 */

import { useLayoutEffect } from 'react'

/** Anchor attribute our slot roots carry; marks "inside our slot". */
const SLOT_ANCHOR = 'data-status-slot'

/** Selector matching the host hover-card portal root by hashed-class substring. */
const CARD_MATCH = '[class*=\'card\']'

/** Elements whose clicks must reach their own handlers even inside the card. */
const INTERACTIVE = 'button, input, textarea, select, a[href], [contenteditable]'

/**
 * Find the host card that owns this event: the nearest ancestor (walking up
 * from the target) that matches the card class fragment AND contains our slot.
 * Walking up instead of a single `closest()` keeps the guard working when the
 * click lands on a nested card-ish element that has no slot of its own.
 */
function hostCardFor(target: Element): Element | null {
  let node: Element | null = target
  while (node !== null) {
    if (node.matches(CARD_MATCH) && node.querySelector(`[${SLOT_ANCHOR}]`) !== null) return node
    node = node.parentElement
  }
  return null
}

/** True when the click target is inside the host card but outside our slot and not interactive. */
function shouldBlock(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false
  if (target.closest(`[${SLOT_ANCHOR}]`) !== null) return false
  if (target.closest(INTERACTIVE) !== null) return false
  return hostCardFor(target) !== null
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

/** Number of mounted slots that need the shared guard. */
let activeGuards = 0

/** Install the single shared capture listener pair. */
function install(): void {
  document.addEventListener('click', guard, true)
  document.addEventListener('keydown', guard, true)
}

/** Remove the shared capture listener pair when the last slot unmounts. */
function uninstall(): void {
  document.removeEventListener('click', guard, true)
  document.removeEventListener('keydown', guard, true)
}

/**
 * While at least one Session hover slot is mounted, swallow clicks and
 * Enter/Space keys on the host card's non-interactive areas so the card stops
 * copying its title. The listener pair is shared across all slots and survives
 * any single slot teardown (notably grouped-card switches between sessions).
 */
export function useCardCopyGuard(): void {
  useLayoutEffect(() => {
    activeGuards += 1
    if (activeGuards === 1) install()
    return () => {
      activeGuards -= 1
      if (activeGuards === 0) uninstall()
    }
  }, [])
}
