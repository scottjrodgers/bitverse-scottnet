/** @param {NS} ns */
export async function main(ns) {

  while(true){
    const numHashes = ns.hacknet.numHashes();
    if (numHashes > 20){  // 20,  1000, 5000, 10000
      ns.hacknet.spendHashes("Sell for Money", undefined, 5);  // 1, 2, 5, 10, 20, 100
    }
    await ns.sleep(100);
  }
}