/** @module Stylesheet contract tests for the Browser bundle.
 *
 * The DSH styling rules require `--dsw-*` tokens instead of literal colors, and
 * two shipped defects were stylesheet-level only (an inline glyph with no box,
 * and an active cell painting its own foreground over the glyph), so the CSS
 * Modules are asserted directly here instead of only through markup checks.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from './vitest-shim.mjs'
import { STATUS_META, STATUS_VALUES } from '../lib/contracts.js'

const BADGE_CSS = readFileSync(new URL('../src/client/badge.module.css', import.meta.url), 'utf8')
const HOVER_CSS = readFileSync(new URL('../src/client/hover.module.css', import.meta.url), 'utf8')

/** Returns the declaration block of `selector`, or null when absent. */
function block(css, selector) {
  const match = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1] : null
}

describe('stylesheet contract', () => {
  it('uses only --dsw-* tokens for colors', () => {
    for (const css of [BADGE_CSS, HOVER_CSS]) {
      const literals = css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []
      expect(literals).toEqual([])
    }
  })

  it('sizes the inline glyph inside a flex wrapper', () => {
    for (const css of [BADGE_CSS, HOVER_CSS]) {
      expect(css).toMatch(/>\s*span\s*\{[^}]*display:\s*flex/)
      expect(css).toMatch(/svg\s*\{[^}]*width:\s*16px/)
    }
  })

  // Regression: `.cell.active` set `background: currentColor` together with a
  // foreground `color`, so the selected cell became a solid block and its
  // glyph disappeared.
  it('never repaints the glyph color on hover or active cells', () => {
    for (const selector of ['\\.cell:hover', '\\.cell\\.active']) {
      const declarations = block(HOVER_CSS, selector)
      expect(declarations).toBeDefined()
      expect(/(?:^|;)\s*color\s*:/.test(declarations)).toBe(false)
      expect(/background\s*:\s*currentColor/.test(declarations)).toBe(false)
    }
  })

  it('keeps the badge box at the glyph size', () => {
    const badge = block(BADGE_CSS, '\\.badge')
    expect(badge).toMatch(/width:\s*16px/)
    expect(badge).toMatch(/height:\s*16px/)
  })

  // Regression: the hover slot renders inside DSH's own hover card, whose
  // surface is a fixed dark color in both themes. Theme aliases resolve to
  // near-black in the light theme, so the buttons and the label were readable
  // on paper and invisible on screen.
  it('keeps hover card text on the static palette, not theme aliases', () => {
    expect(HOVER_CSS).not.toMatch(/--dsw-alias-label-primary/)
    expect(HOVER_CSS).not.toMatch(/--dsw-alias-interactive-bg-hover/)
    expect(HOVER_CSS).toMatch(/--dsw-static-neutral-00/)
  })

  it('gives every status a hover color from the static palette', () => {
    for (const status of STATUS_VALUES) {
      expect(STATUS_META[status].hoverTone).toMatch(/^var\(--dsw-static-[a-z0-9-]+\)$/)
    }
  })

  // The card surface is a fixed dark color, so text and status icons stay on the
  // static palette. The card should still answer a theme switch somewhere, and
  // the hover/selected backgrounds are the safe place: `--dsw-alias-tooltip-key-bg`
  // is derived from `--dsw-alias-tooltip-bg`, which differs between the light and
  // dark blocks of the theme stylesheet, and it sits behind static-colored content.
  it('answers theme switches through the tooltip background token', () => {
    expect(HOVER_CSS).toMatch(/\.cell:hover\s*\{[^}]*background:\s*var\(--dsw-alias-tooltip-key-bg\)/)
    expect(HOVER_CSS).toMatch(/\.cell\.active\s*\{[^}]*background:\s*var\(--dsw-alias-tooltip-key-bg\)/)
  })

  // The compact hover card spans the anchor gap with a 200 ms grace and no bridge
  // element, so a pointer crossing from the row to the content could lose the
  // card. A transparent strip inside this content keeps the pointer inside the
  // host card's pointerenter, cancelling the close.
  it('bridges the anchor-to-card gap so the card stays open on approach', () => {
    const bridge = block(HOVER_CSS, '\\.root::before')
    expect(bridge).toBeDefined()
    expect(bridge).toMatch(/content:\s*''/)
    expect(bridge).toMatch(/position:\s*absolute/)
    expect(bridge).toMatch(/left:\s*-24px/)
    expect(bridge).toMatch(/width:\s*24px/)
  })

  it('keeps the eight picker cells inside the card content box', () => {
    const cell = block(HOVER_CSS, '\\.cell')
    expect(cell).toMatch(/box-sizing:\s*border-box/)
    expect(cell).toMatch(/width:\s*22px/)
    expect(cell).toMatch(/padding:\s*2px/)
    // 8 * 22 + 7 * 2 = 190px, inside the ~196px left after this root's own
    // 6px/8px padding is taken out of the official 212px content box. A 3px
    // gap measured 197px and wrapped the eighth cell onto a second line.
    expect(block(HOVER_CSS, '\\.grid')).toMatch(/gap:\s*2px/)
  })
})
