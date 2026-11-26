/** @module Contract tests for the hover hints the plugin raises.
 *
 * Every hint used to be a native HTML `title` attribute. That attribute does not
 * paint a DSH surface at all — the operating system draws the bubble, with the
 * OS font, OS radius and OS theme, so on a dark DSH window it could appear as a
 * pale square and it never followed the interface language or the `--dsw-*`
 * tokens. The plugin now raises the platform `Tooltip` from
 * `@deepseek-ai/dsh-client-ui-primitives`, which is what every built-in control
 * uses, so hints match the official tooltip's 13px/20px text, its
 * `--dsw-alias-tooltip-bg` surface and its `--dsw-radius-sm` corner.
 *
 * The bundle cannot inline that primitive: the shell hands out a frozen module
 * table (`client/web/src/platform.ts:9-14` lists
 * `@deepseek-ai/dsh-client-ui-primitives`), so the import must survive as a bare
 * `require()` call for the shell to resolve at load time.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { describe, it, expect } from './vitest-shim.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const CLIENT_DIR = new URL('../src/client/', import.meta.url)
const CLIENT_TSX = readdirSync(CLIENT_DIR)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ name, source: readFileSync(new URL(name, CLIENT_DIR), 'utf8') }))

const PACKAGE_JSON = JSON.parse(read('package.json'))
const BUNDLE = read('lib/client.js')

/** The files that show a hint on hover, and the element each hint anchors to. */
const HINT_HOSTS = ['Badge.tsx', 'RowAction.tsx', 'HoverCard.tsx', 'StatusPicker.tsx', 'StatusOverview.tsx']

describe('hover hints', () => {
  it('never uses a native title attribute', () => {
    for (const { name, source } of CLIENT_TSX) {
      expect({ name, titles: source.match(/\stitle=\{/g) ?? [] }).toEqual({ name, titles: [] })
    }
  })

  it('raises the platform tooltip on every hover hint', () => {
    for (const name of HINT_HOSTS) {
      const source = read(`src/client/${name}`)
      expect({ name, importsTooltip: source.includes("import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'") })
        .toEqual({ name, importsTooltip: true })
      expect({ name, usesTooltip: /<Tooltip\b/.test(source) }).toEqual({ name, usesTooltip: true })
    }
  })

  it('labels every tooltip through the translator', () => {
    for (const name of HINT_HOSTS) {
      const source = read(`src/client/${name}`)
      // `label={t('…')}` or `label={entry.title ?? …}`: never a hard-coded string,
      // which would ignore the language switch.
      expect({ name, hardCoded: /label="[^"]*[A-Za-z\u4e00-\u9fa5][^"]*"/.test(source) }).toEqual({ name, hardCoded: false })
    }
  })

  it('keeps the accessible name when the native title goes away', () => {
    for (const name of HINT_HOSTS) {
      const source = read(`src/client/${name}`)
      expect({ name, described: /aria-label=/.test(source) }).toEqual({ name, described: true })
    }
  })

  it('declares the primitives package as a peer the host must provide', () => {
    expect(PACKAGE_JSON.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'])
      .toBe(PACKAGE_JSON.peerDependencies['@deepseek-ai/dsh-client-ui-renderer'])
  })

  it('delegates the primitive to the shell instead of inlining it', () => {
    expect(BUNDLE).toContain('require("@deepseek-ai/dsh-client-ui-primitives")')
    // An inlined tooltip would bring its own bubble class names and its own
    // tokens; the shared one must stay external.
    expect(BUNDLE).not.toMatch(/tooltip-in|_bubble_/)
  })
})
