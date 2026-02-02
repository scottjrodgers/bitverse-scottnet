/** @param {NS} ns **/
export async function main(ns) {
  const flags = ns.flags([
    ["d", 0],       // delay before starting
    ["s", 1],       // scaling before starting
  ]);
  const args = flags._;
  if (args.length < 1) {
    ns.tprintf("Usage: attack-threads <target> [<period_s>] [-s <thread-scale>]");
    ns.exit();
  }
  const delay = flags.d;
  const target = flags._[0]
  const scale = flags.s;
  let period = Math.ceil(ns.getWeakenTime(target) * 1.02 / 1000.0) + 2;

  if(args.length > 1){
    period = Math.floor(flags._[1] / 1000);
  } 
  
  // Now 2 hacks / second.
  ns.tprintf("Chose a period of %s seconds.", period);
  for(let i=0; i<period * 2; i++){
    ns.exec("/dev/weaken_thread.js", 'home', 2 * scale, target, period * 1000);
    await ns.sleep(125);
    ns.exec("/dev/grow_thread.js", 'home', 6 * scale, target, period * 1000);    
    await ns.sleep(125);
    ns.exec("/dev/weaken_thread.js", 'home', 2 * scale, target, period * 1000);
    await ns.sleep(125);
    ns.exec("/dev/hack_thread.js", 'home', 1 * scale, target, period * 1000);
    await ns.sleep(125);
  }
}