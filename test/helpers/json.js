// @ts-check
/**
 * JSON boundary helpers for the test harness.
 *
 * JSON has no Infinity literal — `JSON.stringify(Infinity)` silently yields
 * `null`. `specs/data-contracts.md` A.4 therefore requires Infinity be written
 * as the string "Infinity". These helpers convert at the edge, so everything
 * inside the tests only ever sees real numbers.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively replace "Infinity" / "-Infinity" strings with the numbers.
 * @param {any} value
 * @returns {any}
 */
export function reviveInfinity(value) {
  if (value === "Infinity") return Infinity;
  if (value === "-Infinity") return -Infinity;
  if (Array.isArray(value)) return value.map(reviveInfinity);
  if (value && typeof value === "object") {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveInfinity(v);
    return out;
  }
  return value;
}

/**
 * The inverse — for writing files that conform to A.4.
 * @param {any} value
 * @returns {any}
 */
export function replaceInfinity(value) {
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Array.isArray(value)) return value.map(replaceInfinity);
  if (value && typeof value === "object") {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceInfinity(v);
    return out;
  }
  return value;
}

/**
 * Read and parse a JSON file, reviving Infinity.
 * @param {string} path
 * @returns {any}
 */
export function loadJson(path) {
  return reviveInfinity(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Every *.json in a directory, sorted, as full paths.
 * @param {string} dir
 * @returns {string[]}
 */
export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}
