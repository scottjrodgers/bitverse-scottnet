/** @param {NS} ns */
export async function main(ns) {
  let limit = 2e10;
  while (true) {
    const maxNodes = ns.hacknet.maxNumNodes();
    const numNodes = ns.hacknet.numNodes();
    const hashCapacity = ns.hacknet.hashCapacity();
    const numHashes = ns.hacknet.numHashes();

    const nodeCost = ns.hacknet.getPurchaseNodeCost();

    let cheapestOption = {
      'action': 'node',
      'cost': nodeCost,
      'inst': -1
    };

    for (let i = 0; i < numNodes; i++) {
      const nodeStats = ns.hacknet.getNodeStats(i);
      const options = [
        ['ram', ns.hacknet.getRamUpgradeCost(i, 1)],
        ['level', ns.hacknet.getLevelUpgradeCost(i, 1)],
        ['core', ns.hacknet.getCoreUpgradeCost(i, 1)]
      ]
      for (const [action, cost] of options) {
        if (cost < cheapestOption.cost) {
          cheapestOption['action'] = action;
          cheapestOption['cost'] = cost;
          cheapestOption['inst'] = i;
        }
      }
    }
    const currentCash = ns.getPlayer().money;
    if (currentCash > limit) {  // 1.0e12 = 1 trillion?, 
      if (cheapestOption.cost < currentCash) {
        ns.tprintf("Purchasing: %s for a cost of $%s, on hacknet-%d",
          cheapestOption.action, ns.formatNumber(cheapestOption.cost), cheapestOption.inst);
        if (cheapestOption.action == 'node') {
          ns.hacknet.purchaseNode();
        } else if (cheapestOption.action == 'level') {
          ns.hacknet.upgradeLevel(cheapestOption.inst);
        } else if (cheapestOption.action == 'ram') {
          ns.hacknet.upgradeRam(cheapestOption.inst);
        } else if (cheapestOption.action == 'core') {
          ns.hacknet.upgradeCore(cheapestOption.inst);
        }
      }
    }
    if (limit < 2e11){
      limit += 1e5;
    }
    await ns.sleep(2000);
  }
}