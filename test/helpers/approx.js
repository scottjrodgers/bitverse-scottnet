// @ts-check
/**
 * Float comparison. Node has no `pytest.approx`.
 *
 * Tolerance is RELATIVE, because allocator scores legitimately span many orders
 * of magnitude — a RAM score near 0.1 and a money score near 2.7e-7 are both
 * normal, and one absolute epsilon cannot serve both.
 */
import assert from "node:assert/strict";

/**
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol] relative tolerance, default 1e-9
 * @returns {boolean}
 */
export function approx(actual, expected, tol = 1e-9) {
  if (actual === expected) return true; // exact, and covers Infinity === Infinity
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
  return Math.abs(actual - expected) <= tol * scale;
}

/**
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol]
 * @param {string} [message]
 */
export function assertApprox(actual, expected, tol = 1e-9, message) {
  assert.ok(
    approx(actual, expected, tol),
    message ?? `expected ${expected}, got ${actual} (relative tolerance ${tol})`,
  );
}

/**
 * Compare two objects of numbers key-by-key. Use this instead of
 * `assert.deepStrictEqual` when floats are involved — deepStrictEqual compares
 * bit-for-bit and prints a diff of two numbers that look identical.
 * @param {Record<string, number>} actual
 * @param {Record<string, number>} expected
 * @param {number} [tol]
 */
export function assertApproxObject(actual, expected, tol = 1e-9) {
  assert.deepStrictEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    "key sets differ",
  );
  for (const k of Object.keys(expected)) {
    assertApprox(actual[k], expected[k], tol, `key "${k}": expected ${expected[k]}, got ${actual[k]}`);
  }
}
