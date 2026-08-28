// @ts-check
/**
 * Seconds removed per unit of this round's resource (§6.3).
 * `cost === 0` yields Infinity.
 * @param {number} gainSec
 * @param {number} cost
 * @returns {number}
 */
export function score(gainSec, cost) {
    if (cost !== 0) {
        return gainSec / cost;
    } else {
        return Infinity;
    }
}

/**
 * Seconds of completion time removed by adding `deltaRate` to `rate` (§6.3).
 * Infinity when `rate` is 0 and `deltaRate` > 0 — the zero-rate rule.
 * @param {number} shortfall
 * @param {number} rate
 * @param {number} deltaRate
 * @returns {number}
 */
export function gain(shortfall, rate, deltaRate) {
    return shortfall / rate - shortfall / (rate + deltaRate)
}