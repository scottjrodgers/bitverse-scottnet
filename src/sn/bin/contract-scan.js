/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog('scan');
    const serversToScan = ['home'];
    const scannedServers = new Set();
    const contractsFound = [];

    // Crawl the network to find all servers
    while (serversToScan.length > 0) {
        const host = serversToScan.shift();

        if (scannedServers.has(host)) {
            continue;
        }
        scannedServers.add(host);

        const contracts = ns.ls(host, '.cct');
        if (contracts.length > 0) {
            for (const contract of contracts) {
                contractsFound.push({ host: host, filename: contract });
            }
        }

        const neighborHosts = ns.scan(host);
        for (const neighbor of neighborHosts) {
            if (!scannedServers.has(neighbor)) {
                serversToScan.push(neighbor);
            }
        }
    }

    // Display the results
    if (contractsFound.length > 0) {
        ns.tprint("Found " + contractsFound.length + " coding contracts:");
        for (const contract of contractsFound) {
            ns.tprint(`* ${contract.filename} on server: ${contract.host}`);
        }
    } else {
        ns.tprint("No coding contracts found on the network.");
    }
}
