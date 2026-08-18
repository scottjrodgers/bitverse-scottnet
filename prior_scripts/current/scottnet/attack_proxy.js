/** @param {NS} ns */
export async function main(ns) {
  if (ns.args.length < 1){
    ns.tprintf("Fail.");
    ns.exit();
  }
  let target = ns.args[0];
  ns.tprintf("This would run the attack script on '%s'", target);
}