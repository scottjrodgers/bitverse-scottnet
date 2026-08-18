
export class HacknetUpgrade {
  constructor(node, upgrade, deltaGain, cost){
    this.node = node;
    this.upgrade = upgrade;
    this.deltaGain = deltaGain;
    this.cost = cost;
    this.bought = false;
  }

  value(){
    return 1e9 * this.deltaGain / this.cost;
  }

  describe(ns){
    return ns.sprintf("Node: %d, upgrade: %s, for increased production of %s h/s, at a cost of $%s", 
    this.node, this.upgrade, ns.formatNumber(this.deltaGain), ns.formatNumber(this.cost));
  }

  buyUpgrade(ns){
    if(this.bought == false){
      if(this.upgrade == 'node'){
        ns.hacknet.purchaseNode(this.node);
        this.bought = true;
      }
      if(this.upgrade == 'level'){
        ns.hacknet.upgradeLevel(this.node);
        this.bought = true;
      }
      if(this.upgrade == 'ram'){
        ns.hacknet.upgradeRam(this.node);
        this.bought = true;
      }
      if(this.upgrade == 'core'){
        ns.hacknet.upgradeCore(this.node);
        this.bought = true;
      }
      return this.cost;
    }
  }
}

/*
Hacknet Production

372.53%

Hacknet Purchase Cost

51.05%

Hacknet RAM Upgrade Cost

66.73%

Hacknet Core Purchase Cost

66.73%

Hacknet Level Upgrade Cost

56.72%


*/


function evaluateNode(ns, node){
  const prodMult = 3.7253;
  const purchaseMult = 0.5105;
  const ramMult = 0.6673;
  const coreMult = 0.6673;
  const levelMult = 0.5672;
  const stats = ns.hacknet.getNodeStats(node);
  const nodeCost = ns.formulas.hacknetServers.hacknetServerCost(ns.hacknet.numNodes(), purchaseMult);
  const levelCost = ns.formulas.hacknetServers.levelUpgradeCost(stats.level, 1, levelMult);
  const coreCost = ns.formulas.hacknetServers.coreUpgradeCost(stats.cores, 1, coreMult);
  const ramCost = ns.formulas.hacknetServers.ramUpgradeCost(stats.ram, 1, ramMult);
  const gainRate = ns.formulas.hacknetServers.hashGainRate(stats.level, stats.ramUsed, stats.ram, stats.cores, prodMult);
  const gainWithLevel = ns.formulas.hacknetServers.hashGainRate(stats.level + 1, stats.ramUsed, stats.ram, stats.cores, prodMult);
  const gainWithRam = ns.formulas.hacknetServers.hashGainRate(stats.level, stats.ramUsed, stats.ram * 2, stats.cores, prodMult);
  const gainWithCore = ns.formulas.hacknetServers.hashGainRate(stats.level, stats.ramUsed, stats.ram, stats.cores + 1, prodMult);
  const gainWithNewNode = ns.formulas.hacknetServers.hashGainRate(1, 0, 1, 1, prodMult);
  const deltaGainLevel = gainWithLevel - gainRate;
  const deltaGainCore = gainWithCore - gainRate;
  const deltaGainRam = gainWithRam - gainRate;
  const deltaGainNode = gainWithNewNode - gainRate;
  const choices = [
    new HacknetUpgrade(node, "node", deltaGainNode, nodeCost),
    new HacknetUpgrade(node, "level", deltaGainLevel, levelCost),
    new HacknetUpgrade(node, "ram", deltaGainRam, ramCost),
    new HacknetUpgrade(node, "core", deltaGainCore, coreCost)
  ];

  let bestValue = -1000;
  let best = undefined;
  for (const choice of choices){
    // ns.tprintf("%s", choice.describe(ns));
    if (choice.value() > bestValue){
      bestValue = choice.value();
      best = choice;
    }
  }
  return best;
}


export function getBestHacknetUpgrade(ns){
  const nNodes = ns.hacknet.numNodes();
  let best_value = -1e9;
  let best = undefined; 
  for(let i = 0; i < nNodes; i++){
    let candidate = evaluateNode(ns, i);
    if(candidate.value() > best_value){
      best_value = candidate.value();
      best = candidate;
    }
  }
  return best;
}


/** @param {NS} ns */
// export async function main(ns) {
//   let best = getBestHacknetUpgrade(ns);
//   ns.tprintf("Best upgrade option:");
//   ns.tprintf("On node: %d, upgrade:'%s' will yield a production gain of: %s h/s, for a cost of $%s", best.node, best.upgrade, ns.formatNumber(best.deltaGain), ns.formatNumber(best.cost));
// }