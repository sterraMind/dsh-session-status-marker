/** Minimal `expect` shim backed by node:assert, so the suite runs under
 * `node --test` in this sandbox (Vite/vitest cannot spawn esbuild here).
 */

import assert from 'node:assert/strict'

function isSubset(actual, expected, path = '') {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected array`)
    expected.forEach((v, i) => isSubset(actual[i], v, `${path}[${i}]`))
    return
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${path}: expected object`)
    for (const [k, v] of Object.entries(expected)) isSubset(actual[k], v, path ? `${path}.${k}` : k)
    return
  }
  assert.deepStrictEqual(actual, expected, `${path}: value mismatch`)
}

export function expect(actual) {
  const api = {
    toBe(expected) { assert.strictEqual(actual, expected); return api },
    toEqual(expected) { assert.deepStrictEqual(actual, expected); return api },
    toMatchObject(expected) { isSubset(actual, expected); return api },
    toBeNull() { assert.strictEqual(actual, null); return api },
    toBeDefined() { assert.notStrictEqual(actual, undefined); return api },
    toHaveLength(length) {
      assert.ok(Array.isArray(actual) || typeof actual === 'string', 'expected array or string')
      assert.strictEqual(actual.length, length, `expected length ${length}, got ${actual.length}`)
      return api
    },
    toContain(expected) {
      assert.ok(Array.isArray(actual) || typeof actual === 'string', 'expected array or string')
      assert.ok(actual.includes(expected), `expected to contain ${JSON.stringify(expected)}`)
      return api
    },
    toMatch(pattern) {
      assert.ok(typeof actual === 'string', 'expected string')
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
      assert.ok(re.test(actual), `expected ${JSON.stringify(actual)} to match ${re}`)
      return api
    },
    toBeGreaterThan(n) {
      assert.ok(typeof actual === 'number', 'expected number')
      assert.ok(actual > n, `expected ${actual} > ${n}`)
      return api
    },
    toBeLessThan(n) {
      assert.ok(typeof actual === 'number', 'expected number')
      assert.ok(actual < n, `expected ${actual} < ${n}`)
      return api
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined)
      return api
    },
    toBeTruthy() {
      assert.ok(actual, 'expected a truthy value')
      return api
    },
    toThrow(pattern) {
      assert.throws(actual, pattern instanceof RegExp ? { message: pattern } : undefined)
      return api
    },
    /** Negated matchers: `expect(value).not.toMatch(pattern)`. */
    get not() {
      return {
        toMatch(pattern) {
          assert.ok(typeof actual === 'string', 'expected string')
          const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
          assert.ok(!re.test(actual), `expected ${JSON.stringify(actual)} not to match ${re}`)
        },
        toContain(expected) {
          assert.ok(Array.isArray(actual) || typeof actual === 'string', 'expected array or string')
          assert.ok(!actual.includes(expected), `expected not to contain ${JSON.stringify(expected)}`)
        },
        toBe(expected) {
          assert.notStrictEqual(actual, expected)
        },
        toEqual(expected) {
          assert.notDeepStrictEqual(actual, expected)
        },
      }
    },
    get rejects() {
      return {
        async toThrow(pattern) {
          let threw = false
          try { await actual } catch (error) {
            threw = true
            if (pattern instanceof RegExp) assert.match(String(error?.message ?? error), pattern)
            else if (typeof pattern === 'string') assert.ok(String(error?.message ?? error).includes(pattern))
          }
          assert.ok(threw, 'expected promise to reject')
        },
      }
    },
  }
  return api
}
