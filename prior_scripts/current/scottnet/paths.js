
class ServerNode {
  constructor(name, prev=undefined){
    this.name = name;
    this.set_prev(prev);
  }

  set_prev(prev=undefined){
    this.prev = prev;
    if(prev === undefined){
      this.depth = 0;
    } else {
      this.depth = this.prev.depth + 1;
    }
  }
}


/** @param {NS} ns */
function not_pserv(ns, host){
  return !ns.getServer(host).purchasedByPlayer;
}

function display(ns, server){
  let host = server.name;
  let reqdHack = ns.getServerRequiredHackingLevel(host);
  let numPorts = ns.getServerNumPortsRequired(host);
  let maxMoney = ns.formatNumber(ns.getServerMaxMoney(host), 3, 1000);
  let minSecurity = ns.getServerMinSecurityLevel(host);
  const path = [host];
  for (let s = server.prev; !(s === undefined); s = s.prev){
    // ns.tprintf("   -> %s", s.name);
    path.push(s.name);
  }
  path.reverse();
  let path_str = "";
  for (let p of path){
    // ns.tprintf("path: %s",p);
    path_str = ns.sprintf("%s->%s", path_str, p);
  }
  ns.tprintf("%s: H:%d, P:%d, Cash:%s, Sec.%d, Path: %s", 
              host, reqdHack, numPorts, maxMoney, minSecurity, path_str);
}

/** @param {NS} ns */
function walk(ns, name, servers, previous=undefined, target=undefined){
  // ns.tprintf("target: %s, typeof(target): %s --- %s, %s", target, typeof(target), typeof(target) == "string", typeof(target) === String);
  let new_server = new ServerNode(name, previous);
  if(servers.has(name)){
    let existing_server = servers.get(name);
    if (new_server.depth < existing_server.depth){
      servers.set(name, new_server);
    } else {
      return;
    }
  } else {
    servers.set(name, new_server);
  }
  let this_server = servers.get(name);
  if (typeof(target) == "string"){
    // ns.tprintf("target is a string... name: %s, target: %s", name, target);
    if(name == target){
      display(ns, this_server);
    }
  } else {
      display(ns, this_server);
  }
  let neighbors = ns.scan(name);
  for(let s of neighbors){
    if (not_pserv(ns, s)){
      walk(ns, s, servers, this_server, target);
    }
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const servers = new Map();
  let target = undefined;
  if (ns.args.length > 0){
    target = ns.args[0];
  }

  ns.tprintf("target: %s, typeof(target): %s", target, typeof(target));

  walk(ns, start, servers, undefined, target);  
}