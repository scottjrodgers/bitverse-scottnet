// @ts-check
/**
 * Fixture-driven tests for the allocator.
 *
 * Every *.json in test/fixtures/ becomes one test. Add a case by adding a file;
 * no code change needed. While `allocate()` is unimplemented these register as
 * `todo` rather than failures, so `npm test` stays green as you work.
 *
 * FIXTURE SHAPE — a proposal, change it to suit:
 *
 *   name     what the case is called in the test output
 *   why      what it is trying to prove; prose, for the next reader
 *   given    the starting world: worldView, inventory, constraints,
 *            preferences, goals, candidates
 *   rounds[] one entry per allocation pass. Each may carry `patch` (a shallow
 *            merge into `given` before the pass, for the next round) and
 *            `expect`.
 *
 * It is sequence-shaped from the start on purpose: thrash, lease drain,
 * reservation expiry and MATERIAL_DELTA re-triggering only show up across
 * rounds, and retrofitting a sequence format onto single-shot fixtures later is
 * miserable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadJson, listJsonFiles } from "./helpers/json.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

/** @type {undefined | ((input: any) => any)} */
let allocate;
try {
  ({ allocate } = await import("../scripts/lib/allocator.js"));
  allocate({});                       // probe: throws while unimplemented
} catch {
  allocate = undefined;
}

for (const file of listJsonFiles(FIXTURES)) {
  const fx = loadJson(file);
  const label = fx.name ?? basename(file, ".json");

  test(label, { todo: allocate ? false : "allocate() not implemented yet" }, () => {
    let state = structuredClone(fx.given);

    fx.rounds.forEach((/** @type {any} */ round, /** @type {number} */ i) => {
      if (round.patch) state = { ...state, ...round.patch };

      const result = /** @type {any} */ (allocate)(state);
      const where = `round ${i + 1}`;

      if (round.expect?.outcomes) {
        const actual = Object.fromEntries(
          result.decision.rounds
            .flatMap((/** @type {any} */ r) => r.ranked)
            .map((/** @type {any} */ e) => [e.candidateId, e.outcome]),
        );
        for (const [id, want] of Object.entries(round.expect.outcomes)) {
          assert.equal(actual[id], want, `${where}: outcome for ${id}`);
        }
      }

      if (round.expect?.leases) {
        for (const want of round.expect.leases) {
          const got = result.leases.find(
            (/** @type {any} */ l) =>
              l.consumer === want.consumer && l.resource === want.resource,
          );
          assert.ok(got, `${where}: no lease for ${want.consumer} on ${want.resource}`);
          assert.equal(got.granted, want.granted, `${where}: granted for ${want.resource}`);
        }
      }
    });
  });
}
