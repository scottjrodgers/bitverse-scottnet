/** @param {NS} ns **/
export async function main(ns) {
  const flags = ns.flags([
    ["d", 0],       // delay before starting
  ]);
  const args = flags._;
  if (args.length < 1) {
    ns.tprintf("Usage: attack-server <target> [<period_ms>]");
    ns.exit();
  }
  const delay = flags.d;
  const target = flags._[0]
  let period = Math.ceil(ns.getWeakenTime(target) * 1.02 / 1000.0) + 2;

  if(args.length > 1){
    period = Math.floor(flags._[1] / 1000);
  } 
  
  // Now 2 hacks / second.
  ns.tprintf("Chose a period of %s seconds.", period);
  for(let i=0; i<period * 1; i++){
    ns.exec("/dev/weaken_thread.js", 'home', 1, target, period * 1000);
    await ns.sleep(250);
    ns.exec("/dev/grow_thread.js", 'home', 12, target, period * 1000);    
    await ns.sleep(250);
    ns.exec("/dev/weaken_thread.js", 'home', 3, target, period * 1000);
    await ns.sleep(250);
    ns.exec("/dev/hack_thread.js", 'home', 1, target, period * 1000);
    await ns.sleep(250);
  }
}