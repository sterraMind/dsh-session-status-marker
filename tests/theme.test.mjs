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

  // Regression: the host paints its session-row hover card with the fixed-dark
  // `--dsw-alias-hovercard-*` aliases in both theme blocks (design-platform.css
  // 182/306 and the hovercard alias set), so the card is a dark floating surface
  // on purpose. 1.3.1-rc.3/rc.4 re-pointed that surface at `--dsw-alias-bg-layer-2`
  // and the light theme resolved it to white — a white card with near-white text
  // over a dark window. The card surface and the host's own title/path/time rows
  // are therefore left untouched: we only reset the copy cursor and read the
  // card aliases from our own markup.
  it('leaves the host hover card surface untouched, scoped by :has', () => {
    const scope = HOVER_CSS.match(/\[class\*=['"]card['"]\]:has\(\[data-status-slot\]\)\s*\{([^}]*)\}/)
    expect(scope !== null).toBe(true)
    expect(scope[1]).toMatch(/cursor:\s*default/)
    expect(scope[1]).not.toMatch(/--dsw-alias-hovercard-bg/)
    expect(scope[1]).not.toMatch(/--dsw-hovercard-bg/)
    expect(scope[1]).not.toMatch(/--dsw-alias-hovercard-label-/)
    expect(HOVER_CSS).not.toMatch(/--dsw-alias-hovercard-bg:\s*var\(/)
    for (const line of ['hoverTitle', 'hoverPath', 'hoverTime', 'hoverStatus']) {
      expect(HOVER_CSS).not.toMatch(new RegExp(`\\[class\\*=['"]${line}['"]\\]`))
    }
  })

  // Our block sits on that surface, so it reads the card's label aliases. The
  // fallback has to be the host's static palette, so a build that predates the
  // aliases still renders light text instead of inheriting the page ink onto a
  // dark card.
  it('paints our own panel with the card label aliases, falling back to the static palette', () => {
    expect(HOVER_CSS).toMatch(/var\(--dsw-alias-hovercard-label-primary,\s*var\(--dsw-static-neutral-bluish-00\)\)/)
    expect(HOVER_CSS).toMatch(/var\(--dsw-alias-hovercard-label-secondary,\s*var\(--dsw-static-neutral-bluish-300\)\)/)
    expect(HOVER_CSS).toMatch(/var\(--dsw-alias-hovercard-label-tertiary,\s*var\(--dsw-static-neutral-bluish-400\)\)/)
    expect(HOVER_CSS).not.toMatch(/var\(--dsw-alias-hovercard-label-[a-z]+,\s*var\(--dsw-alias-label-/)
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

  // The host card is dark in both themes, so the interactive feedback tokens are
  // low-alpha overlays that read as a subtle patch on either palette.
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
    // 8 * 22 + 7 * 2 = 190px inside the card's 212px content box (244px card,
    // 16px horizontal padding). A fixed 8-column grid keeps that true without
    // depending on flex-wrap behaviour at the user's font size.
    expect(block(HOVER_CSS, '\\.grid')).toMatch(/gap:\s*2px/)
    expect(block(HOVER_CSS, '\\.grid')).toMatch(/grid-template-columns:\s*repeat\(8,\s*22px\)/)
  })
})
