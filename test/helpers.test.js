// @ts-check
/**
 * Self-test for the harness itself, and a worked example of the shape every
 * other test file takes. If this fails, the problem is the harness, not you.
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { reviveInfinity, replaceInfinity } from "./helpers/json.js";
import { approx, assertApprox, assertApproxObject } from "./helpers/approx.js";

describe("json helpers", () => {
  test('revives "Infinity" anywhere in the tree', () => {
    const raw = { a: "Infinity", b: [1, "-Infinity"], c: { d: "Infinity" }, e: "hello" };
    assert.deepStrictEqual(reviveInfinity(raw), {
      a: Infinity,
      b: [1, -Infinity],
      c: { d: Infinity },
      e: "hello",
    });
  });

  test("round-trips through the A.4 string form", () => {
    const value = { eta: Infinity, score: 0.5 };
    const onDisk = JSON.parse(JSON.stringify(replaceInfinity(value)));
    assert.deepStrictEqual(reviveInfinity(onDisk), value);
  });

  test("plain JSON.stringify would have lost it — this is why the helpers exist", () => {
    assert.equal(JSON.parse(JSON.stringify({ eta: Infinity })).eta, null);
  });
});

describe("approx", () => {
  test("tolerates the last bit", () => {
    assert.ok(approx(0.1 + 0.2, 0.3));
    assert.ok(!approx(0.1 + 0.2, 0.3, 0)); // exact comparison still fails
  });

  test("is relative, so it works at any magnitude", () => {
    assertApprox(2.7e-7, 2.7e-7 * (1 + 1e-12));
    assertApprox(1.1e11, 1.1e11 * (1 + 1e-12));
  });

  test("Infinity equals Infinity but not a large finite number", () => {
    assert.ok(approx(Infinity, Infinity));
    assert.ok(!approx(Infinity, 1e308));
  });

  test("compares objects of floats key by key", () => {
    assertApproxObject({ gain: 412.0, cost: 2304 }, { gain: 412.0000000001, cost: 2304 });
  });
});
