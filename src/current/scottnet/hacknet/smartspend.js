/*
    const lvl = stats.level;
    const ram = stats.ram;
    const ramUsed = stats.ramUsed;
    const cores = stats.cores;
*/


/** @param {NS} ns */
function getHashRate(ns){
  const numNodes = ns.hacknet.numNodes();
  let rate = 0;
  for(let i=0; i < numNodes; i++){
    const stats = ns.hacknet.getNodeStats(i);
    rate += stats.production;
  }

  return rate;
}


/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  
  let cashBucket = 0
  let extrasBucket = 0

  let previousTime = performance.now();
  while(true){
    const newTime = performance.now();
    let delta = (newTime - previousTime) / 1000;
    previousTime = newTime;
    const maxHashes = ns.hacknet.hashCapacity();
    const numHashes = ns.hacknet.numHashes();
    const hashPercent = numHashes / maxHashes;
    const productionRate = getHashRate(ns);
    const extrasPortion = 0.333 * hashPercent ** 2.5;
    const cashPortion = hashPercent - extrasPortion;
    cashBucket += cashPortion * productionRate * delta;
    extrasBucket += extrasPortion * productionRate * delta;
    ns.printf("rate: %s, cashBkt: %s, extrasBkt: %s", productionRate, cashBucket, extrasBucket);

    let cashPurchases = 0;
    while(cashBucket > 4){
      cashPurchases += 1;
      cashBucket -= 4;
    }
    while(extrasBucket > 4){
      cashPurchases += 1;
      extrasBucket -= 4;
    }

    if (cashPurchases > 0){
      ns.printf("purchase Cash: %d times.", cashPurchases);
      ns.hacknet.spendHashes("Sell for Money", undefined, cashPurchases);
    }

    await ns.sleep(1000);
  }    
}