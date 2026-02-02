/** @param {NS} ns */
export async function main(ns) {
    const numNodes = ns.hacknet.numNodes();
    ns.tprintf("You have %d Hacknet nodes.", numNodes);
    for (let i = 0; i < numNodes; i++) {
        const nodeStats = ns.hacknet.getNodeStats(i);
        ns.tprintf("Node %d: Level %d, RAM %dGB, Cores %d, Cache %d",
            i, nodeStats.level, nodeStats.ram, nodeStats.cores, nodeStats.cache);
    }

}