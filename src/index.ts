/** @module Public entry point of the dsh-session-status-marker bundle.
 *
 * The Cordis loader resolves `main` to this module and activates the default
 * class-based plugin. `Config` is re-exported so profile overlays and tests can
 * reference the same schema instance; the rest of the surface lives in
 * `./service.js` and `./types.js`.
 */

export { default, Config, SessionStatusService } from './service.js'
export type { Config as MarkerPluginConfig } from './service.js'
export * from './types.js'
export * from './inference.js'
export { MARKER_DOMAIN_NAME, MARKER_TABLE_NAME, MarkerDomainSpec } from './domain.js'
export type { MarkerDomain } from './domain.js'
