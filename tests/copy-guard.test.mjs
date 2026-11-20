/** Contract tests for the native capture guard that stops the host hover card
 * from copying the session title when the user clicks the card's blank areas.
 *
 * The guard lives in `src/client/copyGuard.ts`. Its whole point is where the
 * listener sits in the propagation path, so the assertions pin the mechanics
 * (capture flag, document target, stopPropagation without preventDefault) and
 * the scope rules (only inside a card that contains our slot, never inside our
 * slot, never on interactive elements).
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from './vitest-shim.mjs'
import { expect } from './expect.mjs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const source = await readFile(join(root, 'src', 'client', 'copyGuard.ts'), 'utf8')
const hoverCard = await readFile(join(root, 'src', 'client', 'HoverCard.tsx'), 'utf8')
const rowAction = await readFile(join(root, 'src', 'client', 'RowAction.tsx'), 'utf8')

describe('hover card copy guard', () => {
  it('registers capture-phase listeners on document', () => {
    expect(source).toContain("document.addEventListener('click', guard, true)")
    expect(source).toContain("document.addEventListener('keydown', guard, true)")
    expect(source).toContain("document.removeEventListener('click', guard, true)")
    expect(source).toContain("document.removeEventListener('keydown', guard, true)")
  })

  it('stops propagation without cancelling the browser default', () => {
    expect(source).toContain('event.stopPropagation()')
    expect(source).not.toContain('event.preventDefault(')
  })

  it('only swallows Enter and Space on the keyboard path', () => {
    expect(source).toContain("if (event.type === 'keydown')")
    expect(source).toContain("key !== 'Enter' && key !== ' '")
  })

  it('scopes the guard to a card that hosts our slot', () => {
    expect(source).toContain("const SLOT_ANCHOR = 'data-status-slot'")
    expect(source).toContain('card === null || card.querySelector')
    expect(source).toContain('target.closest(`[${SLOT_ANCHOR}]`) !== null) return false')
  })

  it('never blocks interactive elements inside the card', () => {
    expect(source).toContain("const INTERACTIVE = 'button, input, textarea, select, a[href], [contenteditable]'")
    expect(source).toContain('target.closest(INTERACTIVE) !== null) return false')
  })

  it('is mounted by the hover slot component', () => {
    expect(hoverCard).toContain('useCardCopyGuard()')
    expect(hoverCard).toContain("from './copyGuard.js'")
  })
})

describe('single floating surface on a session row', () => {
  it('yields the inline picker while the host hover card is open', () => {
    expect(rowAction).toContain("const SLOT_SELECTOR = '[data-status-slot]'")
    expect(rowAction).toContain('document.querySelector(SLOT_SELECTOR) !== null')
    expect(rowAction).toContain('const showPicker = expanded && !cardOpen')
  })

  it('watches the document for the hover slot mounting or leaving', () => {
    expect(rowAction).toContain('new MutationObserver(update)')
    expect(rowAction).toContain('observer.observe(document.body, { childList: true, subtree: true })')
    expect(rowAction).toContain('observer.disconnect()')
  })

  it('does not open a second panel while the card is showing', () => {
    expect(rowAction).toContain('onClick={() => { if (!cardOpen) setExpanded((value) => !value) }}')
    expect(rowAction).toContain('aria-expanded={showPicker}')
  })
})
