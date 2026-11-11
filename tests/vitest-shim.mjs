/** Maps the vitest-shaped test imports to node:test so the suite runs without
 * Vite's esbuild service (blocked by the Windows sandbox: `spawn EPERM`).
 */

export { describe, it, beforeEach, afterEach } from 'node:test'
export { expect } from './expect.mjs'
