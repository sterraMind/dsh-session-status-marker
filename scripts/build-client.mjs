/** @module Build the Browser bundle for dsh-session-status-marker.
 *
 * Replicates the closure-factory format of the DSH shell's `tsdown.client.ts`
 * (`.research/dsh-repo/packages/client/tsdown.client.ts:932-938`): one CJS file
 * at `lib/client.js` wrapped in
 * `window.__ModuleLoader__.load({ id, factory })`.
 *
 * The bundle is produced in-process with the TypeScript compiler API instead of
 * a child-process bundler: the Windows sandbox denies the named-pipe spawn that
 * esbuild's service needs (`spawn EPERM`). Relative imports resolve through a
 * precomputed module table; bare specifiers are delegated to the shell-provided
 * `require`, which only serves the frozen platform module table
 * (`.research/dsh-repo/packages/client/web/src/platform.ts:8-15`).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, basename, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, 'lib')
const PLUGIN_ID = 'dsh-session-status-marker'

/** Source modules compiled into the bundle, keyed by path relative to `src/`. */
const MODULES = {
  'contracts.ts': join(SRC, 'contracts.ts'),
  'client/locales.ts': join(SRC, 'client', 'locales.ts'),
  'client/icons.ts': join(SRC, 'client', 'icons.ts'),
  'client/marks.ts': join(SRC, 'client', 'marks.ts'),
  'client/useMark.ts': join(SRC, 'client', 'useMark.ts'),
  'client/badge.module.css': join(SRC, 'client', 'badge.module.css'),
  'client/hover.module.css': join(SRC, 'client', 'hover.module.css'),
  'client/action.module.css': join(SRC, 'client', 'action.module.css'),
  'client/overview.module.css': join(SRC, 'client', 'overview.module.css'),
  'client/Badge.tsx': join(SRC, 'client', 'Badge.tsx'),
  'client/HoverCard.tsx': join(SRC, 'client', 'HoverCard.tsx'),
  'client/StatusPicker.tsx': join(SRC, 'client', 'StatusPicker.tsx'),
  'client/RowAction.tsx': join(SRC, 'client', 'RowAction.tsx'),
  'client/MenuStatusItem.tsx': join(SRC, 'client', 'MenuStatusItem.tsx'),
  'client/StatusOverview.tsx': join(SRC, 'client', 'StatusOverview.tsx'),
  'client/index.ts': join(SRC, 'client', 'index.ts'),
}
const KEYS = Object.keys(MODULES)
const ENTRY = 'client/index.ts'

/** Stable short hash used to scope local CSS class names. */
function scope(file, name) {
  return name + '_' + createHash('sha1').update(file + ':' + name).digest('hex').slice(0, 6)
}

/** Compile one TS/TSX source to CommonJS, stripping erased type-only imports. */
function compileTs(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      strict: true,
      isolatedModules: true,
    },
  }).outputText
}

/** Build a virtual CommonJS module for one CSS Module sheet. */
function compileCss(source, file) {
  const names = [...source.matchAll(/\.([\w-]+)(?=\s*[,{:.])/g)]
    .map((m) => m[1])
    .filter((n) => /^[a-zA-Z]/.test(n))
  const map = Object.fromEntries([...new Set(names)].map((n) => [n, scope(file, n)]))
  let scoped = source
  for (const [local, hashed] of Object.entries(map)) {
    scoped = scoped.replace(new RegExp('\\.' + local + '(?=[\\s,{:.])', 'g'), '.' + hashed)
  }
  const tagId = `${PLUGIN_ID}/${basename(file)}`
  return [
    `const css = ${JSON.stringify(scoped)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `module.exports = ${JSON.stringify(map)};`,
  ].join('\n')
}

/** Resolve a relative specifier to a module key at build time. */
function resolveKey(from, spec) {
  const base = posix.normalize(posix.join(posix.dirname(from), spec))
  const candidates = base.endsWith('.css')
    ? [base]
    : base.endsWith('.js')
      ? [base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx', base]
      : [base, base + '.ts', base + '.tsx', base + '.css']
  for (const c of candidates) if (KEYS.includes(c)) return c
  throw new Error(`session-status-marker: unresolved relative import ${JSON.stringify(spec)} from ${from}`)
}

async function main() {
  const table = {}
  const links = {}
  for (const [key, file] of Object.entries(MODULES)) {
    const source = await readFile(file, 'utf8')
    const code = file.endsWith('.css') ? compileCss(source, file) : compileTs(source, file)
    table[key] = code
    const specs = new Set()
    for (const m of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
      if (m[1].startsWith('.')) specs.add(m[1])
    }
    links[key] = Object.fromEntries([...specs].map((s) => [s, resolveKey(key, s)]))
  }

  const moduleTable = Object.entries(table)
    .map(([key, code]) => `${JSON.stringify(key)}: function (module, exports, require) {\n${code}\n},`)
    .join('\n')
  const linkTable = Object.entries(links)
    .map(([key, entries]) => `${JSON.stringify(key)}: ${JSON.stringify(entries)},`)
    .join('\n')

  const output = [
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    'var module = { exports: {} }; var exports = module.exports;',
    `var __modules = {\n${moduleTable}\n};`,
    `var __links = {\n${linkTable}\n};`,
    'var __cache = {};',
    'function __load(key) {',
    '  if (__cache[key]) return __cache[key].exports;',
    '  const m = { exports: {} }; __cache[key] = m;',
    '  const table = __links[key] || {};',
    '  const localRequire = (spec) => Object.prototype.hasOwnProperty.call(table, spec) ? __load(table[spec]) : require(spec);',
    '  __modules[key](m, m.exports, localRequire);',
    '  return m.exports;',
    '}',
    '__load(' + JSON.stringify(ENTRY) + ');',
    // The entry's exports must land on the wrapper's module.exports so the
    // shell sees `apply` and `inject` exactly like an in-repo client bundle.
    'module.exports = __cache[' + JSON.stringify(ENTRY) + '].exports;',
    'return module.exports; } });',
  ].join('\n') + '\n'

  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, 'client.js'), output, 'utf8')
  process.stderr.write('[session-status-marker:client] built lib/client.js\n')
}

main().catch((err) => {
  console.error('[session-status-marker:client] build failed:', err)
  process.exit(1)
})
