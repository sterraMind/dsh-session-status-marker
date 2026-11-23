/** @module Keep the active hover card open while a note editor has focus.
 *
 * DSH groups session hover cards (`ui-primitives/src/HoverCardGroup.tsx`): once
 * one card is warm, `onPointerEnter` on ANY sibling row immediately opens that
 * row's card and dismisses the previous one (`:33-50`, `HoverCard.tsx:326-336`).
 * While editing a note that is destructive: a small pointer drift onto the next
 * row swaps cards, unmounts our slot, and drops the in-progress draft. The same
 * group also clears warm state on focus (`HoverCardGroup.tsx:44-46`), which is
 * why the card closed as soon as the note `<input>` took focus.
 *
 * This hook locks the card for the lifetime of the editor:
 * - A capture-phase `pointerover` guard swallows events aimed at OTHER session
 *   rows, so the host group never learns about the drift and cannot swap cards.
 * - A short interval replays `pointerover` on THIS session's row, re-arming the
 *   host's `cancelClose()` so its 200 ms grace timer cannot close the card.
 * The hook is shared by every surface that can edit a note, so there is one
 * implementation of the lock rather than a copy per component.
 */

import { useEffect } from 'react'

/** Selector for host workspace rows that own a hover card. */
const ROW_SELECTOR = '[data-row-key]'

/**
 * Replay the host's own hover signal on a row. The pointer type must be `mouse`
 * because the host ignores touch pointers (`HoverCard.tsx:326-327`).
 */
function pingRow(row: Element): void {
  row.dispatchEvent(new PointerEvent('pointerover', {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerType: 'mouse',
    pointerId: 1,
    isPrimary: true,
    relatedTarget: null,
  }))
}

/** Resolve the row that owns a session, tolerating both key spellings. */
function rowForSession(sessionId: string): Element | null {
  for (const selector of [`[data-row-key="session:${sessionId}"]`, `[data-row-key="${sessionId}"]`]) {
    const row = document.querySelector(selector)
    if (row !== null) return row
  }
  return null
}

/**
 * While `active`, prevent sibling rows from stealing the hover card and keep the
 * current one open. No-op when inactive, so callers can pass their editor state
 * straight through.
 *
 * @param active - True while the note editor is open.
 * @param sessionId - Session whose row must stay active.
 * @param rootRef - Ref to the slot root, used as a fallback row locator.
 */
export function useCardEditLock(active: boolean, sessionId: string, rootRef: { current: HTMLElement | null }): void {
  useEffect(() => {
    if (!active) return
    const row = rowForSession(sessionId) ?? (rootRef.current?.closest(ROW_SELECTOR) ?? null)
    // No owning row (e.g. a menu item, not a hover card): nothing to lock.
    if (row === null) return

    /** Block pointer entry into other session rows so the host cannot swap cards. */
    function blockOtherRows(event: Event): void {
      const target = event.target
      if (!(target instanceof Element)) return
      const otherRow = target.closest(ROW_SELECTOR)
      if (otherRow !== null && otherRow !== row) event.stopPropagation()
    }

    /** Re-arm the host's close timer on the owning row. */
    function keepOpen(): void {
      pingRow(row!)
    }

    document.addEventListener('pointerover', blockOtherRows, true)
    keepOpen()
    const timer = window.setInterval(keepOpen, 120)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('pointerover', blockOtherRows, true)
    }
  }, [active, sessionId, rootRef])
}
