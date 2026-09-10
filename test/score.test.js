// @ts-check
/**
 * Example unit tests for scripts/lib/score.js (strategy.md §6.3).
 *
 * A handful of worked examples, not exhaustive coverage — extend this file
 * with more `test(...)` blocks as you find cases worth pinning down.
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { score, gain } from "../scripts/lib/score.js";
import { assertApprox } from "./helpers/approx.js";

describe("score()", () => {
  // The plain case: score is just gain-per-unit-of-cost.
  test("divides gain by cost", () => {
    assertApprox(score(412.0, 2304), 0.178819444);
  });

  // §6.3's degenerate case, stated explicitly because "the wrong guess is
  // silent": cost === 0 must not throw or return NaN/-Infinity, it must
  // return Infinity.
  test("cost === 0 yields Infinity", () => {
    assert.equal(score(412.0, 0), Infinity);
  });

  // Worth a test on its own: with cost === 0 the *sign* of gainSec never
  // enters the branch, since JS `!== 0` is true for any nonzero cost, and
  // the else-branch fires regardless of gainSec's sign. Pin that down so a
  // future refactor (e.g. `gainSec / cost` with a guard) doesn't quietly
  // change this.
  test("cost === 0 yields Infinity even for a negative gainSec", () => {
    assert.equal(score(-5, 0), Infinity);
  });
});

describe("gain()", () => {
  // eta(g) = S/R; gain = eta(g) - S/(R+deltaRate). Cross-check against the
  // worked example in data-contracts.md's decision.json sample.
  test("matches the decision.json worked example", () => {
    // shortfall/rate from the "cycle-income" goal block; deltaRate chosen so
    // the ranked gain comes out to 412.0 for this candidate.
    const shortfall = 1.5e11;
    const rate = 4.2e6;
    const eta = shortfall / rate;
    // Solve deltaRate backwards from the documented gain, then assert
    // forwards -- avoids hard-coding a deltaRate no one could recover the
    // provenance of.
    const targetGain = 412.0;
    const deltaRate = (shortfall / (eta - targetGain)) - rate;

    assertApprox(gain(shortfall, rate, deltaRate), targetGain, 1e-6);
  });

  // The zero-rate rule (§6.3): R === 0 and deltaRate > 0 must produce
  // Infinity, ranking above every finite improvement. Note this isn't a
  // special case in the implementation -- it falls out of `Infinity - finite
  // === Infinity` for free. That's worth a test precisely because it's
  // implicit: if `gain` is ever rewritten to guard divide-by-zero explicitly,
  // this is the case that must keep working.
  test("zero-rate rule: R === 0, deltaRate > 0 gives Infinity", () => {
    assert.equal(gain(1000, 0, 50), Infinity);
  });

  // A larger deltaRate should never remove *more* seconds than it removes
  // when the deltaRate is smaller -- gain should be monotonically
  // increasing in deltaRate. This is the kind of property test that catches
  // a transposed term (e.g. accidentally swapping rate and rate+deltaRate)
  // that a single worked example might not.
  test("gain increases monotonically with deltaRate", () => {
    const shortfall = 1000;
    const rate = 10;
    const smaller = gain(shortfall, rate, 5);
    const larger = gain(shortfall, rate, 20);
    assert.ok(larger > smaller, `expected gain(...,20) > gain(...,5), got ${larger} <= ${smaller}`);
  });
});
