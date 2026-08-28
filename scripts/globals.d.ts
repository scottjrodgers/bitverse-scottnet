/**
 * Ambient types for the fleet.
 *
 * `NetscriptDefinitions.d.ts` is a MODULE (it has top-level exports), so `NS`
 * is not global on its own — every file would otherwise need an import in its
 * JSDoc. This file lifts the names we use everywhere into the global scope, so
 * a script can simply write:
 *
 *     // @ts-check
 *     /** @param {NS} ns *\/
 *     export async function main(ns) { ... }
 *
 * and get full completion on `ns.`.
 */
import { NS as _NS, Server as _Server, NetscriptPort as _NetscriptPort } from "./NetscriptDefinitions";

declare global {
  type NS = _NS;
  type Server = _Server;
  type NetscriptPort = _NetscriptPort;
}

export {};
