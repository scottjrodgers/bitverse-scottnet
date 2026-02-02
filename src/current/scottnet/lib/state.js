const stateFName = "serverState.txt";

export class ServerStatus{
  constructor(name){
    this.name = name;
    this.prepStarted = false;
    this.prepComplete = false;
    this.nuked = false;
    this.attackStarted = false;
  }
}

/** @param {NS} ns */
export function getAllServerState(ns){
  // const serverInfo = new Map();
  const stateLog = ns.read(stateFName);
  const stateLines = stateLog.split("\n");
  let serverInfo = new Map();
  for(const line of stateLines){
    const tokens = line.split(';');
    if (tokens.length < 3){
      continue;
    }
    const server = tokens[1];
    const state = tokens[2];

    if (typeof(server) == "undefined"){
      continue;
    }
    // ns.tprintf("%s %s", server, state);
    if (!serverInfo.has(server)){
      serverInfo.set(server, new ServerStatus(server));
    }
    let info = serverInfo.get(server);
    if (state == "prepStart"){
      info.prepStarted = true;

      continue;
    }
    if (state == "prepComplete"){
      info.prepComplete = true;
      continue;
    }
    if (state == "serverNuked"){
      info.nuked = true;
      continue;
    }
    if (state == "attackServer"){
      info.attackStarted = true;
      continue;
    }
    serverInfo.set(server, info);
  }
  // ns.tprintf("%d", serverInfo.size);
  return serverInfo;
}


/** @param {NS} ns */
export function getServerState(ns, server){
  let serverInfo = getAllServerState(ns);
  if (serverInfo.has(server)){
    let info = serverInfo.get(server);
    return info;
  } else {
    // ns.tprintf("Empty state record found!");
    return new ServerStatus(server);
  }
}

/** @param {NS} ns */
export async function setPrepStart(ns, server){
  const date = new Date(Date.now()).toISOString();
  ns.write(stateFName, ns.sprintf("%s;%s;prepStart\n", date, server), "a");
}

/** @param {NS} ns */
export async function setPrepComplete(ns, server){
  const date = new Date(Date.now()).toISOString();
  ns.write(stateFName, ns.sprintf("%s;%s;prepComplete\n", date, server), "a");
}

/** @param {NS} ns */
export async function setNuked(ns, server){
  const date = new Date(Date.now()).toISOString();
  ns.write(stateFName, ns.sprintf("%s;%s;serverNuked\n", date, server), "a");
}

/** @param {NS} ns */
export async function setAttackBegun(ns, server){
  const date = new Date(Date.now()).toISOString();
  ns.write(stateFName, ns.sprintf("%s;%s;attackServer\n", date, server), "a");
}

