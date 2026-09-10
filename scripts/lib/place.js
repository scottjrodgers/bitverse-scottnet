/**
 * Seconds of completion time removed by adding `deltaRate` to `rate` (§6.3).
 * Infinity when `rate` is 0 and `deltaRate` > 0 — the zero-rate rule.
 * @param {number} amount
 * @param {number} minPerHost
 * @param {number} deltaRate
 * @returns {number}
 */
export function place(amount, minPerHost, hosts) {
    return shortfall / rate - shortfall / (rate + deltaRate)
}