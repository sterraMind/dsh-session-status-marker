/** @module Browser-side reader for the Host-injected effective configuration.
 *
 * The Host pushes its resolved configuration (schema defaults already applied)
 * onto the page through the official `webserver/index-inject` global, because a
 * dynamic client row carries no config of its own. This module reads that
 * global lazily on every access instead of snapshotting it at apply time: the
 * injection row can land after our `apply()` runs, and a cached snapshot would
 * then keep every consumer on the fallback defaults for the page's lifetime.
 *
 * Every read is defensive. A page served by an older Host simply lacks the
 * keys, and a hand-edited global can carry any type at all, so each value is
 * type-checked before use and falls back to the constant this bundle ships.
 */

import { CLIENT_CONFIG_GLOBAL, DEFAULT_OBSERVATION_TTL_MS } from '../contracts.js'

/** Shape of the injected global as far as this module reads it. */
interface InjectedGlobalShape {
  /** Values the Host actually runs with; absent on Hosts before 1.3.1-rc.2. */
  readonly effective?: unknown
}

/**
 * The injected global, or `undefined` when there is no browser document (unit
 * tests import this module in Node) or the Host injected nothing.
 */
function readGlobal(): InjectedGlobalShape | undefined {
  if (typeof window === 'undefined') return undefined
  const value = (window as unknown as Record<string, unknown>)[CLIENT_CONFIG_GLOBAL]
  if (typeof value !== 'object' || value === null) return undefined
  return value as InjectedGlobalShape
}

/**
 * Read one numeric field from the Host's effective configuration.
 * @param key - Field name inside `effective`.
 * @param fallback - Value to use when the Host is older or the type is wrong.
 */
function readPositiveNumber(key: string, fallback: number): number {
  const effective = readGlobal()?.effective
  if (typeof effective !== 'object' || effective === null) return fallback
  const value = (effective as Record<string, unknown>)[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

/**
 * How long a system observation stays fresh before the picker demotes it.
 *
 * Follows the Host's `observationTtlMs` so raising the option in
 * `cordis.patch.yml` changes the badge and the settings page together.
 */
export function getObservationTtlMs(): number {
  return readPositiveNumber('observationTtlMs', DEFAULT_OBSERVATION_TTL_MS)
}