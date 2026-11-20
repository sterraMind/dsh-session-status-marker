/** @module Regression tests for the manual note editor in the shared picker.
 *
 * The row-action panel and the row-menu panel render the same `StatusPicker`
 * with `showSummary`. This file pins the note path that was added there: the
 * `setSessionNote` transport, the bounded input, the eight-language keys, the
 * theme-token-only styling and the empty-draft normalization. Assertions read
 * source text directly so the suite runs under
 * `node --test --test-isolation=none` without the compiled `lib/` artifacts.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from './vitest-shim.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PICKER = await readFile(join(ROOT, 'src', 'client', 'StatusPicker.tsx'), 'utf8')
const CONTRACTS = await readFile(join(ROOT, 'src', 'contracts.ts'), 'utf8')
const LOCALES = await readFile(join(ROOT, 'src', 'client', 'locales.ts'), 'utf8')
const HOVER_CSS = await readFile(join(ROOT, 'src', 'client', 'hover.module.css'), 'utf8')
const ACTION_CSS = await readFile(join(ROOT, 'src', 'client', 'action.module.css'), 'utf8')
const HOVER = await readFile(join(ROOT, 'src', 'client', 'HoverCard.tsx'), 'utf8')

/** Collect the quoted keys of one exported dictionary from locales.ts. */
function dictionaryKeys(language) {
  const pattern = new RegExp('export const ' + language + '(?:: MarkerDict)? = \\{([\\s\\S]*?)\\n\\}')
  const match = LOCALES.match(pattern)
  expect(match?.[1]).toBeDefined()
  return [...match[1].matchAll(/'([^']+)':/g)].map((m) => m[1])
}

describe('note editor', () => {
  it('exposes setSessionNote posting a manual set that carries the note', () => {
    expect(PICKER).toContain('export async function setSessionNote')
    expect(PICKER).toContain("action: 'set'")
    expect(PICKER).toContain("source: 'manual'")
    expect(PICKER).toContain('note: normalizeNote(note)')
    expect(PICKER).toContain('subjectId: null')
    expect(PICKER).toContain('MARKER_MUTATE_ROUTE')
    expect(PICKER).toContain('publishLocalMark(sessionId')
  })

  it('bounds the input with DEFAULT_MAX_NOTE_LENGTH and seeds it from the mark note', () => {
    expect(CONTRACTS).toContain('export const DEFAULT_MAX_NOTE_LENGTH = 200')
    expect(PICKER).toContain('DEFAULT_MAX_NOTE_LENGTH')
    expect(PICKER).toContain('maxLength={DEFAULT_MAX_NOTE_LENGTH}')
    expect(PICKER).toContain("setDraft(mark?.note ?? '')")
  })

  it('keeps all eight dictionaries key-identical with the three note keys', () => {
    const languages = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
    const added = ['hover.noteEdit', 'hover.noteSave', 'hover.noteCancel']
    const canonical = dictionaryKeys('zh').sort()
    for (const key of added) expect(canonical).toContain(key)
    for (const language of languages) {
      const keys = dictionaryKeys(language)
      expect(keys.sort()).toEqual(canonical)
      for (const key of added) expect(keys).toContain(key)
    }
  })

  it('uses only theme tokens in both stylesheets', () => {
    for (const sheet of [HOVER_CSS, ACTION_CSS]) {
      expect(sheet).toMatch(/--dsw-/)
      expect(sheet).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      expect(sheet).not.toMatch(/rgba?\(/)
    }
  })

  it('normalizes an empty draft to null before posting', () => {
    expect(PICKER).toContain('export function normalizeNote')
    expect(PICKER).toContain('if (note === null) return null')
    expect(PICKER).toMatch(/trimmed === '' \? null : trimmed/)
  })
})

describe('hover card note editor', () => {
  it('renders an edit entry, a bounded input and save/cancel buttons', () => {
    expect(HOVER).toContain('css.editBtn')
    expect(HOVER).toContain('css.noteEditor')
    expect(HOVER).toContain('css.noteInput')
    expect(HOVER).toContain('css.saveBtn')
    expect(HOVER).toContain('css.cancelBtn')
    expect(HOVER).toContain('maxLength={DEFAULT_MAX_NOTE_LENGTH}')
    expect(HOVER).toContain("t('hover.noteEdit')")
    expect(HOVER).toContain("t('hover.noteSave')")
    expect(HOVER).toContain("t('hover.noteCancel')")
  })

  it('keeps the existing note when the user switches status', () => {
    expect(HOVER).toContain('handleSet(s, mark?.note ?? null)')
    expect(HOVER).not.toContain('handleSet(s, null)')
  })

  it('saves the draft against the current status and clears empty drafts', () => {
    expect(HOVER).toContain("handleSet(mark?.status ?? 'todo', normalizeNote(draft))")
    expect(HOVER).toContain('function normalizeNote')
  })
})

describe('picker note preservation', () => {
  it('carries the existing note when a status is picked from the panel', () => {
    expect(PICKER).toContain('setSessionStatus(sessionId, status, previous?.note ?? null)')
    expect(PICKER).toContain('export async function setSessionStatus(sessionId: string, status: StatusEnum, note: string | null = null)')
    expect(PICKER).not.toContain("note: null, subjectId: null }")
  })
})
