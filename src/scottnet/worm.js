
/** @param {NS} ns */
function not_pserv(ns, host){
  return !ns.getServer(host).purchasedByPlayer;
}


function display(ns, host, limit){
  let reqdHack = ns.getServerRequiredHackingLevel(host);
  let numPorts = ns.getServerNumPortsRequired(host);
  let maxMoney = ns.formatNumber(ns.getServerMaxMoney(host), 3, 1000);
  let currMoney = ns.formatNumber(ns.getServerMoneyAvailable(host), 3, 1000);
  let currSecurity = ns.getServerSecurityLevel(host);
  let minSecurity = ns.getServerMinSecurityLevel(host);
  // ns.tprint("limit = %d", limit);
  if (reqdHack <= limit){
    // if(ns.args.length > 0 && ns.args[0] == 'exp'){
    // if(true){
    //   const server = ns.getServer(host);
    //   const player = ns.getPlayer();
    //   const h_exp = ns.formulas.hacking.hackExp(server, player);
    //   const h_time =ns.getHackTime(host);
    //   const exp_rate = ns.formatNumber(1000 * h_exp / h_time);
    //   const money_ratio = ns.formatNumber(ns.getServerMaxMoney(host)/ns.getServerMinSecurityLevel(host));
    //   ns.tprintf("%s: Max Cash: %s, Curr. Cash: %s, Min Security: %d, ExpRate: %s Exp/sec, Money/Security: %s", 
    //       host, maxMoney, currMoney, minSecurity, exp_rate, money_ratio);
    // } else {
      const moneyRatio = ns.formatNumber(ns.getServerMaxMoney(host)/ns.getServerMinSecurityLevel(host));
      ns.tprintf("%s: Hack: %d, Ports: %d, Max Cash: %s, Curr. Cash: %s, Min Security: %d, Curr. Security: %d, Money/Security: %s",
        host, reqdHack, numPorts, maxMoney, currMoney, minSecurity, currSecurity, moneyRatio);
    // }
  }
}


/** @param {NS} ns */
function walk(ns, name, visited, servers, limit, depth=0){
  // ns.tprintf("Server: %s, depth: %d", name, depth);
  const maxMoney = ns.getServerMaxMoney(name);
  visited.add(name);
  servers.push([name, maxMoney]);
  // ns.tprintf("length(servers): %d", servers.length);
  // display(ns, name, limit);
  let neighbors = ns.scan(name);
  for(let s of neighbors){
    if (visited.has(s)){
      continue;
    }
    if (not_pserv(ns, s)){
      walk(ns, s, visited, servers, limit, depth + 1);
    }
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const visited = new Set();
  let servers = [];
  let limit = 1e10;
  if(ns.args.length > 0){
    ns.tprint("Arg: ", ns.args[0], " type=", typeof(ns.args[0]));
    if(typeof(ns.args[0] != "string")){
      limit = ns.args[0];
      ns.tprintf("Using limit of %d", limit);
    }
  }

  walk(ns, start, visited, servers, limit, 0);  
  ns.tprintf("length(servers): %d", servers.length);

  let sorted = servers.sort((a,b) => a[1] - b[1]);
  ns.tprintf("length(sorted): %d", sorted.length);

  for (let s of sorted){
    if (s[0] != "home"){
      display(ns, s[0], limit);
    }
  }
}