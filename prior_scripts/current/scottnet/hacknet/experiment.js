
function evaluate() {
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
}

const prodMult = 5.3098;
const purchaseMult = 0.3634;
const ramMult = 0.4750;
const coreMult = 0.4750;
const levelMult = 0.4037;


/** @param {NS} ns */
export async function main(ns) {
  /*
  Hacknet Production          530.98%  = 5.3098
  Hacknet Purchase Cost       36.34%   = 0.3634
  Hacknet RAM Upgrade Cost    47.50%   = 0.4750
  Hacknet Core Purchase Cost  47.50%   = 0.4750
  Hacknet Level Upgrade Cost  40.37%   = 0.4037
  */

  const cost_fn = "cost_log.txt"
  ns.write(cost_fn, "upgrade,num,cost\n");
  for(let i=0; i<20;i++){
    const nodeCost = ns.formulas.hacknetServers.hacknetServerCost(i, purchaseMult);
    ns.write(cost_fn, ns.sprintf("server,%d,%s\n", i, ns.formatNumber(nodeCost)));
  }
  for(let i=0; i<85;i++){
    const levelCost = ns.formulas.hacknetServers.levelUpgradeCost(i+1, 1, levelMult);
    ns.write(cost_fn, ns.sprintf("level,%d,$%s\n", i+2, ns.formatNumber(levelCost)));
  }
  for(let i=0; i<20;i++){
    const coreCost = ns.formulas.hacknetServers.coreUpgradeCost(i+1, 1, coreMult);
    ns.write(cost_fn, ns.sprintf("core,%d,$%s\n", i+1, ns.formatNumber(coreCost)));
  }
  let sram = 1;
  for(let i=0; i<13;i++){
    const ramCost = ns.formulas.hacknetServers.ramUpgradeCost(sram, 1, ramMult);
    sram = sram * 2;
    ns.write(cost_fn, ns.sprintf("ram,%d,$%s\n", i+1, ns.formatNumber(ramCost)));
  }

  const fname = "production_log.txt";
  let level = 1;
  let ram = 1;
  let cores = 1;
  ns.write(fname, "level,ram,cores,production\n", "w");
  for (let k = 1; k < 64; k++) {
    cores = k;
    for (let j = 1; j < 13; j++) {
      ram = j;
      for (let i = 1; i < 256; i++) {
        level = i;
        const gainRate = ns.formulas.hacknetServers.hashGainRate(level, 0, ram, cores, prodMult);
        // ns.write(fname, ns.sprintf("Level: %d, Ram: %d, Cores: %d, Production: %s", level, ram, cores, gainRate));
        ns.write(fname, ns.sprintf("%d,%d,%d,%s\n", level, ram, cores, gainRate));
      }
    }
  }
  ns.tprintf("Boom! done.");
}