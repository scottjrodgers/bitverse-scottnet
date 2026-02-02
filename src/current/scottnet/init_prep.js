/** @param {NS} ns */
function not_pserv(ns, host) {
  return !ns.getServer(host).purchasedByPlayer;
}

/** @param {NS} ns */
function display(ns, host, _){
  const fname = "/logs/server_targets.txt";
  let reqdHack = ns.getServerRequiredHackingLevel(host);
  let reqdPorts = ns.getServerNumPortsRequired(host);
  let maxMoney = ns.getServerMaxMoney(host);
  if (maxMoney > 1000){
    ns.write(fname, ns.sprintf("%s;%d;%d\n", host, reqdHack, reqdPorts), "a");
  }
}

/** @param {NS} ns */
function walk(ns, name, visited, servers, limit, depth = 0) {
  // display(ns, name, limit);
  visited.add(name);
  const reqdHack = ns.getServerRequiredHackingLevel(name);
  const reqdPorts = ns.getServerNumPortsRequired(name);
  servers.push([name, reqdHack * 10 + reqdPorts]);
  let neighbors = ns.scan(name);
  for (let s of neighbors) {
    if (visited.has(s)) {
      continue;
    }
    if (not_pserv(ns, s)) {
      walk(ns, s, visited, servers, limit, depth + 1);
    }
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const visited = new Set();
  let servers = [];
  let limit = 1e12;
  walk(ns, start, visited, servers, limit, 0);

  let sorted = servers.sort((a,b) => a[1] - b[1]);
  ns.tprintf("length(sorted): %d", sorted.length);
  for (let s of sorted){
    if (s[0] != "home"){
      display(ns, s[0], limit);
    }
  }
}
