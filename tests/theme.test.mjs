/** @module Stylesheet contract tests for the Browser bundle.
 *
 * The DSH styling rules require `--dsw-*` tokens instead of literal colors, and
 * two shipped defects were stylesheet-level only (an inline glyph with no box,
 * and an active cell painting its own foreground over the glyph), so the CSS
 * Modules are asserted directly here instead of only through markup checks.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from './vitest-shim.mjs'

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
})
