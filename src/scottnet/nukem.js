
/** @param {NS} ns */
function not_pserv(ns, host){
  return !ns.getServer(host).purchasedByPlayer;
}

function capture(ns, host){
  let server = ns.getServer(host);
  let reqPorts = server.numOpenPortsRequired;
  if (!server.hasAdminRights){
    let ports = 0;
    if (ns.fileExists("BruteSSH.exe", "home")){
      ns.brutessh(host);
      ports += 1;
    }
    if (ns.fileExists("FTPCrack.exe", "home")){
        ns.ftpcrack(host);
        ports += 1;
    }
    if (ns.fileExists("HTTPWorm.exe", "home")){
        ns.httpworm(host);
        ports += 1;
    }
    if (ns.fileExists("RelaySMTP.exe", "home")){
        ns.relaysmtp(host);
        ports += 1;
    }
    if (ns.fileExists("SQLInject.exe", "home")){
        ns.sqlinject(host);
        ports += 1;
    }
    if (ports >= reqPorts){
      ns.nuke(host);
      ns.tprintf("Nuked server: %s", host);
    }
  }
}

/** @param {NS} ns */
function walk(ns, name, visited){
  visited.add(name);
  capture(ns, name);
  let neighbors = ns.scan(name);
  for(let s of neighbors){
    if (visited.has(s)){
      continue;
    }
    if (not_pserv(ns, s)){
      walk(ns, s, visited);
    }
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const visited = new Set();

  walk(ns, start, visited);  
}