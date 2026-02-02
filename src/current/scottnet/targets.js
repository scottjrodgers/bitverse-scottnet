/** @param {NS} ns */
function display(ns, host, _){
  let server = ns.getServer(host);
  let reqdHack = ns.getServerRequiredHackingLevel(host);
  let hackLevel = ns.getHackingLevel();
  let maxMoney = ns.formatNumber(ns.getServerMaxMoney(host), 3, 1000);
  let currMoney = ns.formatNumber(ns.getServerMoneyAvailable(host), 3, 1000);
  let currSecurity = ns.getServerSecurityLevel(host);
  let minSecurity = ns.getServerMinSecurityLevel(host);
  let tHack = ns.getHackTime(host);
  let tGrow = ns.getGrowTime(host);
  let tWeaken = ns.getWeakenTime(host);
  if (reqdHack <= hackLevel && server.hasAdminRights){
  // if (server.hasAdminRights == true){
      ns.tprintf("%s: Max Cash: %s, Curr. Cash: %s, Min Security: %d, Curr. Security: %d, tWeaken: %s, tGrow: %s, tHack: %s, ReqdHack: %d, Admin: %s",
        host, maxMoney, currMoney, minSecurity, currSecurity, ns.tFormat(tWeaken), ns.tFormat(tGrow), ns.tFormat(tHack), reqdHack, server.hasAdminRights);
  }
}

/** @param {NS} ns */
function not_pserv(ns, host) {
  return !ns.getServer(host).purchasedByPlayer;
}

/** @param {NS} ns */
function walk(ns, name, visited, servers, limit, depth = 0) {
  // display(ns, name, limit);
  visited.add(name);
  const minSecurity = ns.getServerMinSecurityLevel(name);
  servers.push([name, minSecurity]);
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
  let limit = ns.getHackingLevel();
  walk(ns, start, visited, servers, limit, 0);

  let sorted = servers.sort((a,b) => a[1] - b[1]);
  ns.tprintf("length(sorted): %d", sorted.length);
  for (let s of sorted){
    if (s[0] != "home"){
      display(ns, s[0], limit);
    }
  }
}