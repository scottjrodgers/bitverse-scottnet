/** 
 * Scan a server for all relevant info
 * @param {NS} ns 
 **/
export async function main(ns) {
  let target = ns.args[0];
  let maxMoney = ns.getServerMaxMoney(target);
  let minSecurity = ns.getServerMinSecurityLevel(target);
  let reqdHacking = ns.getServerRequiredHackingLevel(target);
  let reqdPorts =ns.getServerNumPortsRequired(target);
  let currSecurity = ns.getServerSecurityLevel(target);
  let currMoney = ns.getServerMoneyAvailable(target);
  let t_hack = ns.getHackTime(target);
  let t_grow = ns.getGrowTime(target);
  let t_weaken = ns.getWeakenTime(target);
  let growTime = t_grow;
  let hackTime = t_hack;
  let weakenTime = t_weaken;
  let e_hack = ns.hackAnalyze(target);
  let e_grow = ns.growthAnalyze(target, 1.01, 1);
  let e_weaken = ns.weakenAnalyze(1, 2);
  // let es_hack = ns.hackAnalyzeSecurity(1, target);
  // let es_grow = ns.growthAnalyzeSecurity(1, target, 2);
  let es_hack = 0.002;
  let es_grow = 0.004;
  const growPerHack = (100 * e_grow * e_hack);
  const weakenPerHack = (es_hack + (growPerHack * es_grow)) / e_weaken;
  const growJobsPerHack = growPerHack * growTime / hackTime;
  const weakenJobsPerHack = weakenPerHack * weakenTime / hackTime;

  ns.tprintf("------------------------------------------------------------------");
  ns.tprintf("Server: %s", target);
  ns.tprintf("Required Hacking Skill: %d", reqdHacking);
  ns.tprintf("Required Ports: %d", reqdPorts);
  ns.tprintf("Current money: %d", currMoney);
  ns.tprintf("Max Money: %d", maxMoney);
  ns.tprintf("Current security: %s", ns.formatNumber(currSecurity, 1));
  ns.tprintf("minSecurity: %d", minSecurity);
  ns.tprintf("Time to weaken: %s", ns.tFormat(t_weaken));
  ns.tprintf("Time to grow: %s", ns.tFormat(t_grow));
  ns.tprintf("Time to hack: %s", ns.tFormat(t_hack));
  ns.tprintf("Effect of hack: %s", ns.formatPercent(e_hack, 5));
  ns.tprintf("Security impact of hack: %s", ns.formatNumber(es_hack, 6));
  ns.tprintf("Threads to grow 1pct: %s, for this hack: %s", ns.formatNumber(e_grow, 3),
      ns.formatNumber(100 * e_grow * e_hack, 3));
  ns.tprintf("Security impact of grow: %s", ns.formatNumber(es_grow, 6));
  ns.tprintf("Effect of weaken: %s", ns.formatNumber(e_weaken, 6));
  ns.tprintf("------------------------------------------------------------------");
  ns.tprintf("For a single hack of %s, we need %s grow threads, and %s weaken threads to compensate.", target,
      ns.formatNumber(growPerHack, 3), ns.formatNumber(weakenPerHack, 3));
  // ns.tprintf("(%s + (%s * %s)) / %s == %s", ns.formatNumber(es_hack), ns.formatNumber(growPerHack), ns.formatNumber(es_grow),
  //                                           ns.formatNumber(e_weaken), ns.formatNumber((es_hack + (growPerHack * es_grow)) / e_weaken));
  ns.tprintf("growPerHack: %s", ns.formatNumber(growPerHack));
  ns.tprintf("weakenPerHack: %s", ns.formatNumber(weakenPerHack));
  ns.tprintf("growJobsPerHack: %s", ns.formatNumber(growJobsPerHack));
  ns.tprintf("weakenJobsPerHack: %s", ns.formatNumber(weakenJobsPerHack));

}