// Canonical assertions live in `./marks.test.mjs` so they run under `node --test`
// without a bundler (the Windows sandbox blocks the esbuild service spawn that
// Vitest's config loader needs). This shell keeps IDE/Vitest discoverability.
import './marks.test.mjs'
