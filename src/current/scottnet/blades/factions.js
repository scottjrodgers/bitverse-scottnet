async function buildFactionRep(ns, faction, targetRep, action="security"){
  let factionRep = ns.singularity.getFactionRep(faction);
  ns.singularity.workForFaction(faction, action, true);
  while (factionRep < targetRep){
    factionRep = ns.singularity.getFactionRep(faction);
    await ns.sleep(30000);
  }
}


/** @param {NS} ns */
export async function main(ns) {
  // await buildFactionRep(ns, "CyberSec", 18750, "Hacking");
  await buildFactionRep(ns, "Tian Di Hui", 37600, "Security");
  await buildFactionRep(ns, "Chongqing", 50100, "Security");
  await buildFactionRep(ns, "Slum Snakes", 7600, "Security");
  await buildFactionRep(ns, "Tetrads", 62600, "Security");
  // await buildFactionRep(ns, "Sector-12", 50100, "Security");

  ns.run("/scottnet/blades/bladeloop.jsb");
}