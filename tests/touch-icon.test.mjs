/** @module Regression tests for the marketplace icon and the touch menu entry.
 *
 * The icon is a 36×36 filled surface: the marketplace and plugin list render it
 * on both light and dark backgrounds, so an outline-only glyph in
 * `currentColor` disappears on light pages (observed as a plain dark check on
 * the plugin page). These assertions pin the gradient fill and the white
 * strokes that keep the mark visible on any background.
 *
 * The touch entry assertions pin the anatomy the official Menu row uses so the
 * "设置状态" line stops looking different from the built-in Pin and Archive
 * rows: an icon column, an ellipsized label, official paddings and font sizes.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from './vitest-shim.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ICON = await readFile(join(ROOT, 'icon.svg'), 'utf8')
const CSS = await readFile(join(ROOT, 'src', 'client', 'action.module.css'), 'utf8')
const MENU = await readFile(join(ROOT, 'src', 'client', 'MenuStatusItem.tsx'), 'utf8')
const PICKER = await readFile(join(ROOT, 'src', 'client', 'StatusPicker.tsx'), 'utf8')

describe('marketplace icon', () => {
  it('paints a filled surface so the mark survives light and dark pages', () => {
    expect(ICON).toContain('width="36"')
    expect(ICON).toContain('viewBox="0 0 36 36"')
    expect(ICON).toMatch(/fill="url\(#[^"]+\)"/)
    expect(ICON).toMatch(/stop-color="#/)
    expect(ICON).toContain('stroke="#FFFFFF"')
  })

  it('keeps the check plus dot motif readable without currentColor', () => {
    expect(ICON).not.toContain('currentColor')
    expect(ICON).toContain('aria-hidden="true"')
  })
})

describe('touch menu entry anatomy', () => {
  it('matches the official MenuRow metrics', () => {
    // Row: 34px min height, 6px/8px padding, 6px gap, 13px text (Menu.module.css:178-193).
    expect(CSS).toMatch(/\.menuTrigger \{[\s\S]*?min-height: 34px/)
    expect(CSS).toMatch(/\.menuTrigger \{[\s\S]*?padding: 6px 8px/)
    expect(CSS).toMatch(/\.menuTrigger \{[\s\S]*?gap: 6px/)
    expect(CSS).toMatch(/\.menuTrigger \{[\s\S]*?font-size: 13px/)
    expect(CSS).toMatch(/\.menuTrigger \{[\s\S]*?line-height: 20px/)
    // Icon column: 14px box, official icon alias (Menu.module.css:254-262).
    expect(CSS).toMatch(/\.menuIcon \{[\s\S]*?width: 14px/)
    expect(CSS).toMatch(/\.menuIcon \{[\s\S]*?color: var\(--dsw-alias-menu-icon\)/)
    expect(CSS).toMatch(/\.menuIcon svg \{[\s\S]*?width: 14px/)
    // Label: flex 1 with ellipsis (Menu.module.css:275-280).
    expect(CSS).toMatch(/\.menuLabel \{[\s\S]*?flex: 1/)
    expect(CSS).toMatch(/\.menuLabel \{[\s\S]*?text-overflow: ellipsis/)
  })

  it('renders the current status icon in front of the label', () => {
    expect(MENU).toContain('ICONS[icon]')
    expect(MENU).toContain('STATUS_META[mark.status].icon')
    expect(MENU).toContain('css.menuIcon')
    expect(MENU).toContain('css.menuLabel')
    expect(MENU).toContain("t('menu.setStatus')")
  })

  it('shows the summary, note and clear action inside the expanded panel', () => {
    expect(PICKER).toContain('showSummary')
    expect(PICKER).toContain('panelSummary')
    expect(PICKER).toContain("t('hover.note'")
    expect(PICKER).toContain('clearSessionStatus')
    expect(PICKER).toContain("t('hover.clearBtn')")
    expect(CSS).toContain('.menuPanel')
    expect(CSS).toContain('.panelSummary')
    expect(CSS).toContain('.panelNote')
    expect(CSS).toContain('.panelActions')
  })

  it('keeps theme tokens only', () => {
    expect(CSS).toMatch(/--dsw-alias-/)
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CSS).not.toMatch(/\brgba?\(/)
  })
})
