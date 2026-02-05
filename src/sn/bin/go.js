import { shell } from "/scottnet/lib/core.js";


class ServerNode {
  constructor(name, prev = undefined) {
    this.name = name;
    this.set_prev(prev);
  }

  set_prev(prev = undefined) {
    this.prev = prev;
    if (prev === undefined) {
      this.depth = 0;
    } else {
      this.depth = this.prev.depth + 1;
    }
  }
}

/** @param {NS} ns */
function walk(ns, name, servers, previous = undefined, target = undefined) {
  let new_server = new ServerNode(name, previous);
  if (servers.has(name)) {
    let existing_server = servers.get(name);
    if (new_server.depth < existing_server.depth) {
      servers.set(name, new_server);
    } else {
      return;
    }
  } else {
    servers.set(name, new_server);
  }
  let this_server = servers.get(name);
  let neighbors = ns.scan(name);
  for (let s of neighbors) {
    walk(ns, s, servers, this_server, target);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  const start = "home"
  const servers = new Map();
  let target = undefined;
  if (ns.args.length < 1) {
    ns.tprintf("go <target system>");
    ns.exit();
  }
  target = ns.args[0];
  walk(ns, start, servers, undefined, target);
  let cmd = ""
  let s = servers.get(target);
  while (s) {
    cmd = ns.sprintf("connect %s; %s", s.name, cmd);
    s = s.prev;
  }
  // ns.tprint(cmd);
  shell(cmd);
}