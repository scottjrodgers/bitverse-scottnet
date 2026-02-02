/** @param {NS} ns */
export async function main(ns) {
    const upgrades = ns.hacknet.getHashUpgrades();
    for(const upg of upgrades){
        ns.tprintf("Upgrade: '%s'", upg);
    }
    while(true){
        if(ns.hacknet.numHashes() > 1000){
            ns.hacknet.spendHashes("Sell for Money");
        }
        await ns.sleep(1000);
    }
}