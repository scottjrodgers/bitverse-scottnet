/*
  Walk the graph of servers and look at all the processes. kill the ones that match the script and target
 */

import { get_my_network, get_network } from "/scottnet/lib/servers.js";
import { botMap, collect_processes } from "/scottnet/lib/process.js"


/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false], // help flag
    ['all', false],   // by_server
  ]);
  if (flags._.length < 1 && !flags.all) {
    ns.tprintf("stop <script> [<target-server>]  [--all]");
    ns.exit();
  }
  let script = '';
  let target = '';
  let search_key = '';
  if (flags._.length > 0) {
    script = flags._[0];
    search_key = script;
  }
  if (flags._.length > 1) {
    target = flags._[1];
    search_key = ns.sprintf("%s %s", search_key, target);
  }

  // if (flags.all) {
  //   ns.tprintf("--all not implementd!!  Shame. :(");
  //   ns.exit();
  // }

  if (!flags.all) {
    let scriptPath = '';
    if (script in botMap) {
      scriptPath = botMap[script];
    } else {
      ns.tprintf("Script '%s' not recognized.", script);
      ns.exit();
    }
  }
  let my_servers = get_my_network(ns);
  let processes = collect_processes(ns, my_servers);
  for (let [processKey, proc] of processes) {
    if (processKey.startsWith(search_key) || flags.all) {
      // ns.tprintf("Killing all processes for %s %s", script, target);
      for (let p of proc.pids) {
        ns.kill(p);
      }
    }
  }
}