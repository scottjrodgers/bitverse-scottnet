/*
  This will do the equivalent of the ps command, but across all nuked servers.
  It will also aggregate the jobs and summarize their threads and RAM usage
 */

import {get_my_network, totalRam, totalFreeRam, getHacknetFreeRam} from "/scottnet/lib/servers.js";
import {EMPTY, collect_processes} from "/scottnet/lib/process.js";


/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false], // help flag
        ['s', false],   // by_server
        ['g', EMPTY],   // a grep string
    ]);
    const my_servers = get_my_network(ns);
    const pids = collect_processes(ns, my_servers, flags.s, flags.g);
    const pids = collect_processes(ns, my_servers, flags.s, flags.g);
    ns.tprintf("\nTHREADS  SCRIPT + ARGS                                          RAM USAGE");
    ns.tprintf(  "-------------------------------------------------------------------------");
    let keys = [...pids.keys()].sort();
    for (let key of keys) {
        const process = pids.get(key);
        let ram_str = ns.formatRam(process.ramUsage());
        ns.tprintf("%s  %s    %s", ns.sprintf("%d", process.threads).padStart(7), key.padEnd(50), ram_str.padStart(10));
    }
    if (keys.length > 0) {
        ns.tprintf("-------------------------------------------------------------------------");
    }
    const total_ram = totalRam(my_servers);
    const total_free_ram = totalFreeRam(my_servers);
    const hacknetFreeRam = getHacknetFreeRam(my_servers);
    // const used_ram = total_ram - total_free_ram;
    ns.tprintf("Total RAM: %s, Free RAM: %s, Hacknet Free RAM: %s", ns.formatRam(total_ram),
        ns.formatRam(total_free_ram), ns.formatRam(hacknetFreeRam));
}