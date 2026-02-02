import {getAllServerState, getServerState} from "/scottnet/lib/state.js"


/** @param {NS} ns */
function not_pserv(ns, host) {
  return !ns.getServer(host).purchasedByPlayer;
}

/** @param {NS} ns */
function walk(ns, name, visited, servers, limit, depth = 0) {
  // display(ns, name, limit);
  visited.add(name);
  const hackLevel = ns.getServerRequiredHackingLevel(name);
  servers.push([name, hackLevel]);
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



/* @param {NS} ns */ 
async function serverStatus(ns, target) {
  let hackLevel = ns.getHackingLevel();
  let reqdHacking = ns.getServerRequiredHackingLevel(target);
  let maxMoney = ns.getServerMaxMoney(target);
  if (maxMoney <= 0){
    return;
  }
  if (hackLevel < reqdHacking){
    return;
  }
  let state = getServerState(ns, target);
  let currMoney = ns.getServerMoneyAvailable(target);
  let minSecurity = ns.getServerMinSecurityLevel(target);
  let currSecurity = ns.getServerSecurityLevel(target);
  let hackSecs = ns.getHackTime(target) / 1000;
  let growSecs = ns.getGrowTime(target) / 1000;
  let weakenSecs = ns.getWeakenTime(target) / 1000;
  let moneyPct = ns.formatPercent(currMoney / maxMoney, 1);
  let excessSecurityPct = ns.formatPercent(currSecurity / minSecurity - 1.0, 1);
  let weakenTime = ns.sprintf("%ss", ns.formatNumber(weakenSecs, 1, 1e10));
  let growTime = ns.sprintf("%ss", ns.formatNumber(growSecs, 1, 1e10));
  let hackTime = ns.sprintf("%ss", ns.formatNumber(hackSecs, 1, 1e10));
  let isPrepStarted = state.prepStarted;
  let isPrepComplete = state.prepComplete;
  let isNuked = state.nuked;
  let isAttacked = state.attackStarted;
  let status = "";
  if (isPrepComplete){
    status += "P";
  } else if(isPrepStarted){
    status += "p";
  } else {
    status += ".";
  }
  if (isNuked){
    status += " N";
  } else {
    status += " .";
  }
  if (isAttacked){
    status += " A";
  } else {
    status += " .";
  }

  let columns = [
    String(target).padEnd(20),
    ns.sprintf("%d", reqdHacking).padStart(7),
    String(status).padStart(7),
    ns.formatNumber(maxMoney, 2).padStart(9),
    excessSecurityPct.padStart(8),
    moneyPct.padStart(8),
    weakenTime.padStart(10),
    growTime.padStart(10),
    hackTime.padStart(10)
  ];

  ns.tprintf("%s", columns.join(" "));
}

function printHeader(ns){
    let headers = [
    "server".padEnd(20),
    "hacking".padStart(7),
    "status".padStart(7),
    "maxMoney".padStart(9),
    "security".padStart(8),
    "money".padStart(8),
    "wknTime".padStart(10),
    "growTime".padStart(10),
    "hackTime".padStart(10)
  ];
  ns.tprintf("")
  ns.tprintf("%s", headers.join(" "));
  ns.tprintf("-------------------------------------------------------------------------------------------------");
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const visited = new Set();
  let servers = [];
  let limit = ns.getHackingLevel();
  walk(ns, start, visited, servers, limit, 0);
  // let serverState = getAllServerState(ns);
  // ns.tprintf("%s, %s", typeof(serverState), serverState.size);
  // ns.tprintf("%s", JSON.stringify(serverState));
  printHeader(ns);
  let sorted = servers.sort((a,b) => a[1] - b[1]);
  for (let s of sorted){
    if (s[0] != "home"){
      // ns.tprintf("srv: [%s]", s[0])
      serverStatus(ns, s[0]);
    }
  }
}