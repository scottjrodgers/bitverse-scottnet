import {threadLoop} from "/dev/base_thread.js"

/** @param {NS} ns **/
export async function main(ns) {
  const flags = ns.flags([
    ["d", 0],       // delay before starting
  ]);
  const args = flags._;
  if (args.length < 2) {
    ns.tprintf("Usage: weaken_thread.js <target> <period_ms> [-d delay_ms]");
    ns.exit();
  }
  const delay = flags.d;
  const target = flags._[0]
  const period = flags._[1]
  if (delay > 0) {
    await ns.sleep(delay);
  }
  await threadLoop(ns, "Weaken", target, period, ns.weaken, ns.getWeakenTime);
}