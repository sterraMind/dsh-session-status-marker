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
const OVERVIEW_CSS = readFileSync(new URL('../src/client/overview.module.css', import.meta.url), 'utf8')

/** Returns the declaration block of `selector`, or null when absent. */
function block(css, selector) {
  const match = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1] : null
}

describe('stylesheet contract', () => {
  it('uses only --dsw-* tokens for colors', () => {
    for (const css of [BADGE_CSS, HOVER_CSS, OVERVIEW_CSS]) {
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

  // Regression: the DSH host card is authored with a hard-coded dark surface
  // and hard-coded light text in BOTH themes. Painting only our panel (1.0.3)
  // wedged a white block between dark host text; blending into the fixed dark
  // card (1.1.1) left the light theme showing a black card. The fix retargets
  // the whole host card from our slot with theme aliases, gated by :has() so
  // other HoverCards are untouched. Assert the takeover covers surface + every
  // host text line and is scoped to the card containing our slot.
  it('retargets the whole host card to theme aliases, scoped by :has', () => {
    expect(HOVER_CSS).toMatch(/\[class\*=['"]card['"]\]:has\(\[data-status-slot\]\)/)
    expect(HOVER_CSS).toMatch(/--dsw-hovercard-bg:\s*var\(--dsw-alias-bg-layer-2\)/)
    for (const line of ['hoverTitle', 'hoverPath', 'hoverTime', 'hoverStatus']) {
      expect(HOVER_CSS).toMatch(new RegExp(`\\[class\\*=['"]${line}['"]\\][^}]*color:\\s*var\\(--dsw-alias-label-`))
    }
  })

  it('paints our own panel with theme aliases, not fixed dark-surface tokens', () => {
    expect(HOVER_CSS).toMatch(/--dsw-alias-label-primary/)
    expect(HOVER_CSS).toMatch(/--dsw-alias-label-secondary/)
    expect(HOVER_CSS).not.toMatch(/--dsw-static-neutral-00/)
  })

  it('gives every status a theme-aware hover color', () => {
    for (const status of STATUS_VALUES) {
      expect(STATUS_META[status].hoverTone).toMatch(/^var\(--dsw-alias-(state|label)-[a-z0-9-]+\)$/)
    }
  })

  // The status-overview page is a settings panel on a host surface that already
  // follows the theme, so it uses theme aliases: page surface `--dsw-alias-bg-layer-2`,
  // primary text `--dsw-alias-label-primary`, hover `--dsw-alias-interactive-bg-hover`.
  it('draws the status-overview page with theme aliases', () => {
    expect(OVERVIEW_CSS).toMatch(/--dsw-alias-bg-layer-2/)
    expect(OVERVIEW_CSS).toMatch(/--dsw-alias-label-primary/)
    expect(OVERVIEW_CSS).toMatch(/\.row:hover\s*\{[^}]*background:\s*var\(--dsw-alias-interactive-bg-hover\)/)
  })

  // The card surface now follows the theme, so interaction feedback uses the
  // same theme-aware tokens as the rest of the DSH surfaces.
  it('answers hover and active through theme interactive tokens', () => {
    expect(HOVER_CSS).toMatch(/\.cell:hover\s*\{[^}]*background:\s*var\(--dsw-alias-interactive-bg-hover\)/)
    expect(HOVER_CSS).toMatch(/\.cell\.active\s*\{[^}]*background:\s*var\(--dsw-alias-interactive-bg-active\)/)
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
    expect(bridge).toMatch(/left:\s*-8px/)
    expect(bridge).toMatch(/width:\s*8px/)
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
