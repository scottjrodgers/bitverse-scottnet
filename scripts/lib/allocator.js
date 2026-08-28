// @ts-check
/**
 * The allocator — `specs/strategy.md` §5.2, §6.
 *
 * A LIBRARY, NOT A DIRECTOR FEATURE (§14). Nothing in this file may reference
 * `/state/director.json`, player money, or any other specific resource pool. It
 * takes data in and returns data out, so a corporation can run the same code
 * over its own pool.
 *
 * It also touches no `ns` API, which is what makes it testable in plain Node
 * and what should keep the Director's RAM near zero (§13.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS IMPLEMENTED. This is a proposed decomposition — argue with it.
 * Suggested order, smallest first, each testable on its own:
 *
 *   1. gain / score      §6.3   arithmetic, ~10 lines
 *   2. evalCondition     §3     six kinds + unknown propagation
 *   3. paybackSec        §6.1b  two definitions under one name
 *   4. etaOfGoal         §2.4a  recursion over preconditions, cycle detection
 *   5. placeGrant        §5.2   the bin-packer
 *   6. allocate          §6.5   nine steps, ties the rest together
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NOT_IMPLEMENTED = () => {
  throw new Error("not implemented");
};

/**
 * Evaluate a condition against the world view (§3).
 * Three-valued: an unresolvable path yields "unknown", which propagates.
 * @param {any} condition
 * @param {Record<string, number|string|boolean>} worldView
 * @returns {true|false|"unknown"}
 */
export function evalCondition(condition, worldView) {
  return NOT_IMPLEMENTED();
}

/**
 * Derived, never authored (§6.1b). Two different quantities under one name:
 * seconds to recoup a spend, or seconds before a lease produces anything.
 * @param {any} candidate
 * @returns {number}
 */
export function paybackSec(candidate) {
  return NOT_IMPLEMENTED();
}

/**
 * Completion time for a goal (§2.4a), recursing through preconditions for a
 * structural goal. A cycle is a malformed goals file, not a stack overflow.
 * @param {string} goalId
 * @param {any[]} goals
 * @param {Record<string, number>} shortfalls
 * @param {Record<string, number>} rates
 * @returns {number}
 */
export function etaOfGoal(goalId, goals, shortfalls, rates) {
  return NOT_IMPLEMENTED();
}

/**
 * Bin-pack a fungible request into placed lease rows (§5.2).
 *
 * Objective, applied to the WHOLE request: the smallest single host that fits
 * it; only if none fits, the fewest hosts that do. Applied greedily chunk by
 * chunk instead, this fills the smallest adequate host first and returns a pile
 * of unusable slivers — that version is easier to write and looks correct.
 *
 * @param {number} amount
 * @param {number} minPerHost smallest usable contiguous chunk, 0 for none
 * @param {{host: string, free: number}[]} hosts free RAM per host, bookkeeping
 * @returns {{host: string, gb: number}[] | null} null if unsatisfiable
 */
export function placeGrant(amount, minPerHost, hosts) {
  return NOT_IMPLEMENTED();
}

/**
 * One allocation pass (§6.5). Pure: same input, same output, no clock, no RNG.
 *
 * @param {object} input
 * @param {Record<string, any>} input.worldView
 * @param {any[]} input.goals
 * @param {any[]} input.constraints
 * @param {any[]} input.preferences
 * @param {any[]} input.candidates
 * @param {{host: string, maxRam: number}[]} input.inventory
 * @returns {{leases: any[], purchases: any[], reservations: any[],
 *            assignments: Record<string, string>, decision: any}}
 */
export function allocate(input) {
  return NOT_IMPLEMENTED();
}
