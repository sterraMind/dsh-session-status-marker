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
    // The eight status cells share one bubble anchored to the whole rail, so the
    // hint holds its position while the pointer crosses from cell to cell
    // instead of following it in 24px steps.
    for (const name of ['HoverCard.tsx', 'StatusPicker.tsx']) {
      const source = read(`src/client/${name}`)
      expect({ name, tooltips: (source.match(/<Tooltip\b/g) ?? []).length }).toEqual({ name, tooltips: 1 })
      expect({ name, wrapsGrid: /<Tooltip\b[^>]*>\s*<(?:div|span)\s+className=\{css\.grid\}/.test(source) })
        .toEqual({ name, wrapsGrid: true })
    }
  })

  it('anchors the rail bubble below the rail with a fixed gap', () => {
    // The eight status cells share one bubble. It must sit below the rail
    // (`side="bottom"`), stay centred on the rail (`align="center"`) and keep
    // the host's own 8px gap, otherwise it covers the card's own rows.
    for (const name of ['HoverCard.tsx', 'StatusPicker.tsx']) {
      const source = read(`src/client/${name}`)
      const rail = source.match(/<Tooltip\b[^>]*label=\{tipLabel\}[^>]*>/)?.[0] ?? ''
      expect({ name, side: /side="bottom"/.test(rail) }).toEqual({ name, side: true })
      expect({ name, align: /align="center"/.test(rail) }).toEqual({ name, align: true })
      expect({ name, gap: /gap=\{8\}/.test(rail) }).toEqual({ name, gap: true })
      expect({ name, delay: /delayMs=\{300\}/.test(rail) }).toEqual({ name, delay: true })
    }
  })

  it('clears the hovered status on the rail, not on each cell', () => {
    // The host tooltip withdraws its bubble on the anchor's click
    // (`ui-primitives/src/Tooltip.tsx:255-261`). Because the bubble is anchored
    // to the rail, a click that reaches the anchor would close it for the rest
    // of the hover. Each cell therefore stops that click, and the rail owns the
    // "no cell" state so the label does not flash the mark's own status while
    // the pointer crosses the gap between two cells.
    for (const name of ['HoverCard.tsx', 'StatusPicker.tsx']) {
      const source = read(`src/client/${name}`)
      const railBlock = source.match(/className=\{css\.grid\}[\s\S]{0,1200}/)?.[0] ?? ''
      expect({ name, railClears: /onPointerLeave=\{\(\) => setHoveredStatus\(null\)\}/.test(railBlock) })
        .toEqual({ name, railClears: true })
      expect({ name, railChecksTarget: /relatedTarget instanceof Node/.test(railBlock) })
        .toEqual({ name, railChecksTarget: true })
      // The cells must not clear the state themselves any more.
      const cells = source.split(/onPointerEnter=\{\(\) => setHoveredStatus\(/).slice(1)
      const cellBlocks = cells.map((rest) => rest.split(/\>(?!=)/)[0])
      expect({ name, cellsClear: cellBlocks.filter((block) => /setHoveredStatus\(null\)/.test(block)).length })
        .toEqual({ name, cellsClear: 0 })
      // A click on a cell must not reach the host anchor.
      const cellClicks = source.match(/onClick=\{\(event\) => \{/g) ?? []
      expect({ name, cellClicks: cellClicks.length }).toEqual({ name, cellClicks: 1 })
      expect({ name, cellStopsClick: /onClick=\{\(event\) => \{[\s\S]{0,900}?event\.stopPropagation\(\)/.test(source) })
        .toEqual({ name, cellStopsClick: true })
    }
  })

  it('falls back to the marked status when no cell is hovered', () => {
    for (const name of ['HoverCard.tsx', 'StatusPicker.tsx']) {
      const source = read(`src/client/${name}`)
      expect({ name, fallback: /hoveredStatus \?\? mark\?\.status/.test(source) }).toEqual({ name, fallback: true })
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
