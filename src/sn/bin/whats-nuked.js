
/** @param {NS} ns */
function not_pserv(ns, host) {
  return !ns.getServer(host).purchasedByPlayer;
}


function display(ns, host, limit) {
  const server = ns.getServer(host);
  const ram = server.maxRam;
  const freeRam = ram - server.ramUsed;
  const ramStr = ns.formatRam(freeRam);
  const maxRamStr = ns.formatRam(ram);
  const backdoor = server.backdoorInstalled;
  let maxMoney = "N/A";
  let currMoney = 'N/A';
  if (typeof(server.maxMoney) != 'undefined'){
    maxMoney = ns.formatNumber(server.moneyMax, 3, 1000);
    currMoney = ns.formatNumber(server.moneyAvailable, 3, 1000);
  } 
  let currSecurity = server.hackDifficulty;
  let minSecurity = server.minDifficulty;
  if (server.hasAdminRights == true) {
    ns.tprintf("%s: RAM: %s/%s, Backdoor: %s, Max Cash: %s, Curr. Cash: %s, Min Security: %s, Curr. Security: %s",
      host, ramStr, maxRamStr, backdoor, maxMoney, currMoney, minSecurity, currSecurity);
  }
}


/** @param {NS} ns */
function walk(ns, name, visited, servers, limit, depth = 0) {
  // ns.tprintf("walk: %s, Depth: %d", name, depth);
  display(ns, name, limit);
  visited.add(name);
  let neighbors = ns.scan(name);
  for (let s of neighbors) {
    if (visited.has(s)) {
      continue;
    }
    walk(ns, s, visited, servers, limit, depth + 1);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const visited = new Set();
  let servers = [];
  let limit = 1e10;
  ns.tprintf("Starting");
  walk(ns, start, visited, servers, limit, 0);
}