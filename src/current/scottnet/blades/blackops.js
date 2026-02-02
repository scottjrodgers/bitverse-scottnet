/** @param {NS} ns */
export async function main(ns) {
  const names = ns.bladeburner.getBlackOpNames();
  ns.tprintf("Black Ops Missions:");
  let i = 0;
  for (const name of names){
    i += 1;
    ns.tprintf("%d: %s", i, name);
  }
}