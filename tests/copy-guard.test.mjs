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
  it('owns no panel of its own: the row hover card is the only surface', () => {
    expect(rowAction).not.toContain('popover')
    expect(rowAction).not.toContain('StatusPicker')
    expect(rowAction).not.toContain('aria-expanded')
  })

  it('swallows the glyph press before React reaches the host card handlers', () => {
    expect(rowAction).toContain("const ACTION_ANCHOR = 'data-status-action'")
    expect(rowAction).toContain("document.addEventListener('pointerdown', guard, true)")
    expect(rowAction).toContain("document.addEventListener('click', guard, true)")
    expect(rowAction).toContain("document.removeEventListener('pointerdown', guard, true)")
    expect(rowAction).toContain("document.removeEventListener('click', guard, true)")
    expect(rowAction).toContain('event.stopPropagation()')
  })

  it('replays the pointer entry the host card listens for', () => {
    expect(rowAction).toContain("row.dispatchEvent(new PointerEvent('pointerover'")
    expect(rowAction).toContain("pointerType: 'mouse'")
    expect(rowAction).toContain("if (event.type === 'click') openRowCard(glyph)")
  })
})
