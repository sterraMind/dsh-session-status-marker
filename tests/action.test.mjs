/** @module Registration and locale regression tests for the two non-hover entries.
 *
 * Checks read source text directly so this file runs under
 * `node --test --test-isolation=none` without the compiled `lib/` artifacts,
 * which a parallel build step may be rewriting at the same time.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from './vitest-shim.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLI = await readFile(join(ROOT, 'src', 'client', 'index.ts'), 'utf8')
const CONTRACTS = await readFile(join(ROOT, 'src', 'contracts.ts'), 'utf8')
const PATCH = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
const LOCALES = await readFile(join(ROOT, 'src', 'client', 'locales.ts'), 'utf8')
const BUILD = await readFile(join(ROOT, 'scripts', 'build-client.mjs'), 'utf8')
const PICKER = await readFile(join(ROOT, 'src', 'client', 'StatusPicker.tsx'), 'utf8')
const ROW = await readFile(join(ROOT, 'src', 'client', 'RowAction.tsx'), 'utf8')
const MENU = await readFile(join(ROOT, 'src', 'client', 'MenuStatusItem.tsx'), 'utf8')
const CSS = await readFile(join(ROOT, 'src', 'client', 'action.module.css'), 'utf8')
const OFFICIAL = await readFile(
  join(ROOT, '.research', 'dsh-repo', 'packages', 'client', 'ui-workspace', 'src', 'client', 'index.ts'),
  'utf8',
)

/** Extract one `ctx.slots.register({...}, Component)` call from its inject block. */
function registerBlock(slot, component) {
  const start = CLI.indexOf(`ctx.slots.inject('${slot}'`)
  expect(start).toBeGreaterThan(-1)
  const tail = CLI.slice(start)
  const reg = tail.indexOf('ctx.slots.register(')
  expect(reg).toBeGreaterThan(-1)
  const end = tail.indexOf(`${component},`, reg)
  expect(end).toBeGreaterThan(-1)
  return tail.slice(reg, end)
}

/** Collect the quoted keys of one exported dictionary from locales.ts. */
function dictionaryKeys(language) {
  const pattern = new RegExp('export const ' + language + '(?:: MarkerDict)? = \\{([\\s\\S]*?)\\n\\}')
  const match = LOCALES.match(pattern)
  expect(match?.[1]).toBeDefined()
  return [...match[1].matchAll(/'([^']+)':/g)].map((m) => m[1])
}

describe('row action registration', () => {
  it('registers after the official archive and pin entries', () => {
    const officialAt = OFFICIAL.indexOf("ctx.slots.inject('sidebar.workspaces.session.row.action'")
    expect(officialAt).toBeGreaterThan(-1)
    const officialOrders = [...OFFICIAL.slice(officialAt).matchAll(/\border:\s*(\d+)/g)]
      .slice(0, 2)
      .map((m) => Number(m[1]))
    expect(officialOrders).toEqual([100, 200])

    const block = registerBlock('sidebar.workspaces.session.row.action', 'SessionStatusRowAction')
    expect(block).toContain("name: 'sidebar.workspaces.session.row.action'")
    expect(block).toContain("id: 'session-status-row-action'")
    expect(block).toContain('locale: NS')
    expect(block).toContain('order: rowActionOrder')
    expect(300).toBeGreaterThan(officialOrders[1])
  })

  it('wires the row button to the shared picker and stops propagation', () => {
    expect(ROW).toContain('StatusPicker')
    expect(ROW).toContain("t('action.aria')")
    expect(ROW).toContain("t('action.trigger')")
    expect(ROW).toContain('onClick={stop}')
    expect(ROW).toContain('onKeyDown={stop}')
    expect(ROW).toContain('stopPropagation()')
  })
})

describe('row menu registration', () => {
  it('registers the menu item with its own id, order and locale', () => {
    const block = registerBlock('sidebar.workspaces.session.menu.item', 'MenuStatusItem')
    expect(block).toContain("name: 'sidebar.workspaces.session.menu.item'")
    expect(block).toContain("id: 'session-status-menu-item'")
    expect(block).toContain('locale: NS')
    expect(block).toContain('order: menuItemOrder')
  })

  it('uses the owner menu hook and role=menuitem for touch and keyboard fallback', () => {
    expect(MENU).toContain('useMenuOpenState')
    expect(MENU).toContain('setMenuOpen(false)')
    expect(MENU).toContain('role="menuitem"')
    expect(MENU).toContain("t('menu.setStatus')")
    expect(MENU).toContain('itemRole="menuitem"')
    expect(MENU).toContain('onClick={stop}')
    expect(MENU).toContain('onKeyDown={stop}')
    expect(MENU).toContain('stopPropagation()')
  })
})

describe('shared picker contract', () => {
  it('reads statuses, icons and tokens from the shared modules', () => {
    expect(PICKER).toContain('STATUS_VALUES.map')
    expect(PICKER).toContain('STATUS_META[status]')
    expect(PICKER).toContain('ICONS[meta.icon]')
    expect(PICKER).toContain('meta.hoverTone')
    expect(PICKER).toContain("t(meta.labelKey)")
    expect(PICKER).toContain("t('action.error')")
    expect(PICKER).not.toContain("'todo', 'done'")
  })

  it('posts the manual set body to the existing route and publishes locally', () => {
    expect(PICKER).toContain('MARKER_MUTATE_ROUTE')
    expect(PICKER).toContain("action: 'set'")
    expect(PICKER).toContain("source: 'manual'")
    expect(PICKER).toContain('note: null')
    expect(PICKER).toContain('subjectId: null')
    expect(PICKER).toContain('publishLocalMark(sessionId')
  })

  it('keeps eight 22px cells on one line using only theme tokens', () => {
    expect(CSS).toContain('width: 22px')
    expect(CSS).toContain('height: 22px')
    expect(CSS).toContain('padding: 2px')
    expect(CSS).toContain('gap: 2px')
    expect(CSS).toContain('box-sizing: border-box')
    expect(CSS).toMatch(/--dsw-alias-/)
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CSS).not.toMatch(/\brgba?\(/)
  })
})

describe('build and locale coverage', () => {
  it('adds every new module to the browser bundle table', () => {
    for (const key of [
      'client/StatusPicker.tsx',
      'client/RowAction.tsx',
      'client/MenuStatusItem.tsx',
      'client/action.module.css',
    ]) {
      expect(BUILD).toContain(`'${key}':`)
    }
  })

  it('keeps all eight dictionaries key-identical with the new action keys', () => {
    const languages = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
    const added = ['action.aria', 'action.trigger', 'action.error', 'menu.setStatus']
    const canonical = dictionaryKeys('zh').sort()
    for (const key of added) expect(canonical).toContain(key)
    for (const language of languages) {
      const keys = dictionaryKeys(language)
      expect(keys.sort()).toEqual(canonical)
      for (const key of added) expect(keys).toContain(key)
    }
    expect(LOCALES).toContain('export const DICTIONARIES = { zh, en, ja, es, fr, de, ru, pt }')
  })
})

describe('configurable slot orders', () => {
  it('defines default orders of 300 and a shared global name', () => {
    expect(CONTRACTS).toContain('export const DEFAULT_ROW_ACTION_ORDER = 300')
    expect(CONTRACTS).toContain('export const DEFAULT_MENU_ITEM_ORDER = 300')
    expect(CONTRACTS).toContain("export const CLIENT_CONFIG_GLOBAL = '__DSH_SESSION_MARKER_CONFIG__'")
  })

  it('reads orders from the injected page global with default fallback', () => {
    expect(CLI).toContain('CLIENT_CONFIG_GLOBAL')
    expect(CLI).toContain('rowActionOrder = typeof browserConfig.rowActionOrder === ')
    expect(CLI).toContain('DEFAULT_ROW_ACTION_ORDER')
    expect(CLI).toContain('DEFAULT_MENU_ITEM_ORDER')
  })

  it('exposes both orders as profile configuration', () => {
    expect(PATCH).toContain('rowActionOrder: 300')
    expect(PATCH).toContain('menuItemOrder: 300')
  })
})
