/** @module i18n regression tests: all locale dictionaries and status metadata must align.
 *
 * These checks catch mismatches before bundle time — e.g. a labelKey in
 * STATUS_META that does not appear in the locale dictionary, or a status whose
 * icon glyph has no matching entry in ICONS.
 */

import { describe, it, expect } from './vitest-shim.mjs'
// Canonical imports are through contracts.ts so they compile without DSH deps.
import { STATUS_VALUES, STATUS_META, AUTO_REASON_VALUES, MARK_SOURCES, DEFAULT_MAX_NOTE_LENGTH } from '../lib/contracts.js'
import { ICONS, ICON_PIXEL_SIZE } from '../lib/client/icons.js'
import { DICTIONARIES, zh } from '../lib/client/locales.js'

describe('i18n consistency', () => {
  it('has a metadata entry for every status value', () => {
    for (const s of STATUS_VALUES) {
      const m = STATUS_META[s]
      expect(m).toBeDefined()
      expect(typeof m.icon).toBe('string')
      expect(typeof m.tone).toBe('string')
      expect(typeof m.labelKey).toBe('string')
      expect(m.labelKey).toMatch(/^status\./)
    }
  })

  it('all tone values reference theme-alias tokens (state or label)', () => {
    for (const s of STATUS_VALUES) {
      const tone = STATUS_META[s].tone
      const isThemeAlias = tone.startsWith('var(--dsw-alias-state-') || tone.startsWith('var(--dsw-alias-label-')
      expect(isThemeAlias).toBe(true)
    }
  })

  it('AUTO_REASON_VALUES is non-empty and each item is a string', () => {
    expect(AUTO_REASON_VALUES.length).toBeGreaterThan(0)
    for (const r of AUTO_REASON_VALUES) expect(typeof r).toBe('string')
  })

  it('MARK_SOURCES contains manual first, then auto', () => {
    expect(MARK_SOURCES).toEqual(['manual', 'auto'])
  })

  it('DEFAULT_MAX_NOTE_LENGTH is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_MAX_NOTE_LENGTH)).toBe(true)
    expect(DEFAULT_MAX_NOTE_LENGTH).toBeGreaterThan(0)
  })

  // Regression: ICONS was keyed by status while STATUS_META.icon holds the
  // official glyph id, so every badge shipped with an empty glyph.
  it('resolves every status icon to a real SVG in the bundle', () => {
    for (const s of STATUS_VALUES) {
      const glyph = ICONS[STATUS_META[s].icon]
      expect(typeof glyph).toBe('string')
      expect(glyph.startsWith('<svg')).toBe(true)
    }
  })

  // Regression: the glyphs had no width/height, so the badge laid out a 0x0
  // SVG and the sidebar indicator was invisible on a real page. Markup-only
  // checks passed, so the size has to be asserted here.
  it('declares an explicit pixel box on every glyph root', () => {
    for (const s of STATUS_VALUES) {
      const glyph = ICONS[STATUS_META[s].icon]
      expect(glyph).toMatch(new RegExp(`^<svg[^>]*width="${ICON_PIXEL_SIZE}"`))
      expect(glyph).toMatch(new RegExp(`^<svg[^>]*height="${ICON_PIXEL_SIZE}"`))
      expect(glyph).toMatch(/viewBox="0 0 16 16"/)
      expect(glyph).toMatch(/aria-hidden="true"/)
      expect(glyph.endsWith('</svg>')).toBe(true)
    }
  })

  it('carries no icon the statuses do not use', () => {
    expect(Object.keys(ICONS).length).toBe(STATUS_VALUES.length)
  })
})

describe('locale dictionaries', () => {
  const shellLanguages = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']

  // Regression: only zh/en were registered, so switching the shell to one of
  // the six other languages it offers left this namespace's copy in English.
  it('ships a dictionary for every language the shell offers', () => {
    for (const language of shellLanguages) {
      expect(DICTIONARIES[language]).toBeDefined()
    }
    expect(Object.keys(DICTIONARIES).length).toBe(shellLanguages.length)
  })

  it('keeps every dictionary key-identical to the canonical zh dictionary', () => {
    const canonical = Object.keys(zh)
    for (const [language, dict] of Object.entries(DICTIONARIES)) {
      expect(Object.keys(dict).sort()).toEqual([...canonical].sort())
      for (const key of canonical) {
        expect(typeof dict[key]).toBe('string')
        expect(dict[key].length).toBeGreaterThan(0)
      }
    }
  })

  it('preserves the substitution placeholders in every dictionary', () => {
    for (const dict of Object.values(DICTIONARIES)) {
      expect(dict['hover.auto']).toContain('{status}')
      expect(dict['hover.auto']).toContain('{reason}')
      expect(dict['hover.note']).toContain('{note}')
      expect(dict['hover.manual']).toContain('{status}')
    }
  })
})
