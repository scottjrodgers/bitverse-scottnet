import {getBestHacknetUpgrade} from "/scottnet/hacknet/hacknetUpgrades.js";


function getProduction(ns){
  let production = 0;
  for(let i=0; i<ns.hacknet.numNodes(); i++){
    const stats = ns.hacknet.getNodeStats(i);
    production += stats.production;
  }
  return production;
}


function calcGrowthFraction(production){
  const b = 0.2;
  let fraction = b + (1 - b) * Math.exp(-(1 - b) * (production / 20) ** 2);
  return fraction;
}


/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  let hacknetFunds = 0;
  let nextPurchase = getBestHacknetUpgrade(ns);
  ns.printf("Next upgrade: %s", nextPurchase.describe(ns));
  let previousTime = performance.now();
  let counter = 0;
  while (true) {
    const newTime = performance.now();
    const delta = (newTime - previousTime) / 1000;
    previousTime = newTime;

    const production = getProduction(ns);
    const growthFraction = calcGrowthFraction(production);
    const growthDeposit = 1e6 * production * growthFraction * delta / 4;

    hacknetFunds += growthDeposit;

    // ns.tprintf("production: %s, growthFraction: %s, deltaT: %s, growthDeposit: %s, hacknetFunds: %s",
      // ns.formatNumber(production), ns.formatNumber(growthFraction), ns.formatNumber(delta), ns.formatNumber(growthDeposit), ns.formatNumber(hacknetFunds));
    if (hacknetFunds > nextPurchase.cost){
      hacknetFunds -= nextPurchase.buyUpgrade(ns);
      nextPurchase = getBestHacknetUpgrade(ns);
      ns.printf("Next upgrade: %s", nextPurchase.describe(ns));
    }
    // counter ++;
    // if (counter > 100){
    //   break;
    // }
    await ns.sleep(2000);
  }
  // for(let i=0; i < 50; i++){
  //   ns.tprintf("test: production = %d, growth fraction = %s", i, ns.formatNumber(calcGrowthFraction(ns, i)));
  // }
  // ns.tprintf("Real: production = ??, growth fraction = %s", ns.formatNumber(calcGrowthFraction(ns)));
}