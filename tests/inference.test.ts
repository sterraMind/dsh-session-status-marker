/** Vitest/IDE-compatible entry point.
 *
 * The canonical assertions live in `./inference.test.mjs` so the suite runs
 * under `node --test --test-isolation=none` in a sandbox that forbids spawning
 * esbuild/Vite helper processes. Vitest is not used by this project's scripts.
 */

import './inference.test.mjs'
