import { BotDeployment, execBotDeployment } from "/scottnet/lib/process.js";
import { get_my_network, totalFreeRam } from "/scottnet/lib/servers.js";
import { collect_processes } from "/scottnet/lib/process.js";
import { setAttackBegun, setPrepStart, setPrepComplete, getAllServerState, getServerState } from "/scottnet/lib/state.js"

const NO_SERVER = 'no-server-available';


function shush(ns) {
  ns.disableLog("scp");
  ns.disableLog("scan");
  ns.disableLog("sleep");
  ns.disableLog("getServerMaxMoney");
  ns.disableLog("getServerMoneyAvailable");
}


function chooseNextPrep(ns, serverList) {
  const serverInfo = getAllServerState(ns);
  for (const serverName of serverList) {
    if (serverInfo.has(serverName)) {
      const info = serverInfo.get(serverName);
      if (info.prepStarted || info.prepComplete || info.attackStarted) {
        // It's past the need for prep
        continue;
      }
      if (info.nuked) {
        return serverName;
      }
    }
  }
  return NO_SERVER;
}


function canAttack(ns, serverName) {
  const state = getServerState(ns, serverName);
  if (!state.prepComplete) {
    return false;
  }
  if (!state.nuked) {
    return false
  }

  const reqdHack = ns.getServerRequiredHackingLevel(serverName);
  const hackLevel = ns.getHackingLevel();
  return reqdHack <= hackLevel
}


function canPrep(ns, serverName) {
  const info = getServerState(ns, serverName);
  if (info.prepStarted || info.prepComplete || info.attackStarted) {
    return false;
  }
  if (info.nuked) {
    return true;
  }
  return false;
}


function isPrepped(ns, serverName) {
  const my_servers = get_my_network(ns);
  const pids = collect_processes(ns, my_servers, false);

  let keys = [...pids.keys()].sort();
  for (let key of keys) {
    const tokens = key.split(" ");
    if (tokens.size < 2) {
      continue;
    }
    const job = tokens[0];
    if (job != 'grow-prep' && job != 'weaken-prep') {
      continue;
    }
    const target = tokens[1];
    if (target == serverName) {
      return false;
    }
  }
  if ((ns.getServerMoneyAvailable(serverName) >= ns.getServerMaxMoney(serverName) * 0.98) &&
    (ns.getServerSecurityLevel(serverName) <= ns.getServerMinSecurityLevel(serverName) + 1)) {
    setPrepComplete(ns, serverName);
    return true;
  }
  return false;
}

/*-------------------------------------------------------------------------------------------
  DO PREP
  Weaken and Grow
  for starting out, count of 10 is fine with a gap appropriate for the BN
  Starting out, 1W, 1G
  Now that I'm up to 1TB RAM, Going to try 4W & 4G
--------------------------------------------------------------------------------------------*/
async function doPrep(ns, target) {
  // const count = 40; // 20
  // const gap = 1234; // ms
  const count = 20; // 20
  const gap = 1234; // ms

  let deploymentConfig = new BotDeployment(target, 1);
  deploymentConfig.addBatch(ns, "grow-prep", count, gap, 4);   // 1  up to 4+ when further along
  deploymentConfig.addBatch(ns, "weaken-prep", count, gap, 4); // 1
  await execBotDeployment(ns, deploymentConfig);
  setPrepStart(ns, target);
}

/*-------------------------------------------------------------------------------------------
  DO ATTACK
  Weaken and Grow AND hack
  for starting out, count of 10 is fine with a gap appropriate for the BN and Server
  Starting out with low RAM: 1W, 1G, 1H
--------------------------------------------------------------------------------------------*/
async function doAttack(ns, target) {
  const gap = 500;
  const weakenCount = Math.ceil(ns.getWeakenTime(target) / gap) + 1
  const growCount = Math.ceil(ns.getGrowTime(target) / gap) + 1;
  const hackCount = Math.ceil(ns.getHackTime(target) / gap);
  const growDelay = (weakenCount - growCount) * gap;
  const hackDelay = (weakenCount - hackCount) * gap;

  let deploymentConfig = new BotDeployment(target, 1);
  deploymentConfig.addBatch(ns, "weaken", weakenCount, gap, 1);  // 1   - peaked at 3
  deploymentConfig.addBatch(ns, "grow", growCount, gap, 1, growDelay);  // 2  - peaked at 20
  deploymentConfig.addBatch(ns, "hack", hackCount, gap, 1, hackDelay);  // 1
  await execBotDeployment(ns, deploymentConfig);
  setAttackBegun(ns, target);

}

/** @param {NS} ns */
function estimateAttack(ns, target) {
  const gap = 500;
  const weakenCount = Math.ceil(ns.getWeakenTime(target) / gap) + 1;
  const growCount = 2 * Math.ceil(ns.getGrowTime(target) / gap) + 1;
  const hackCount = Math.ceil(ns.getHackTime(target) / gap);
  let estimate = ((weakenCount + growCount) * 1.8) + (hackCount * 1.75);
  return estimate;
}

/** @param {NS} ns */
function estimatePrep(ns, target) {
  const weakenCount = 80;
  const growCount = 80;
  let estimate = ((weakenCount + growCount) * 1.8);
  return estimate;
}

/** @param {NS} ns */
function buildPrepActive(ns,) {
  const serverInfo = getAllServerState(ns);
  let prepActive = new Set();
  for (let [server, info] of serverInfo) {
    // const info = serverInfo.get(server);
    if (info.prepStarted && !info.prepComplete) {
      prepActive.add(server);
    }
  }

  return prepActive;
}




/** @param {NS} ns */
export async function main(ns) {
  const fnameServers = "/logs/bn6-targets.txt";

  shush(ns);

  // Core Data
  const prepActive = buildPrepActive(ns);
  const readyToAttack = new Set();
  let serverList = [];

  let fileData = ns.read(fnameServers);
  let rows = fileData.split("\n");
  for (const line of rows) {
    const tokens = line.split(";");
    const server = tokens[0];
    serverList.push(server);
  }

  ns.tprintf("starting prep-controller main loop...");

  // main loop
  for (; ;) {
    // add targets to prepping active list if they can be prepped
    if (prepActive.size <= 2) {
      let target = chooseNextPrep(ns, serverList);
      // ns.tprintf("candidate: %s", target);
      if (target != NO_SERVER) {
        const my_servers = get_my_network(ns);
        let freeRam = totalFreeRam(my_servers);
        let prepEstimate = estimatePrep(ns, target);
        if (prepEstimate < freeRam * 0.95) {
          if (canPrep(ns, target)) {
            ns.tprintf("HACK-CTRL: Prepping %s...", target);
            prepActive.add(target);
            await doPrep(ns, target);
          } else {
            ns.tprintf("HACK-CTRL: Prep complete for %s.", target);
            readyToAttack.add(target);
          }
        } else {
          // ns.tprintf("Not enough RAM...");
        }
      } else {
        // ns.tprintf("No Server...");
      }
    }

    // check if any prep-active servers are done-prepping -- if so, attack.
    let prepList = [...prepActive];
    for (const serverName of prepList) {
      if (isPrepped(ns, serverName)) {
        ns.tprintf("HACK-CTRL: Prep complete for %s.", serverName);
        readyToAttack.add(serverName);
        prepActive.delete(serverName);
      }
    }

    // check if any ready-to-attack servers are within our hack-level ability
    let attackList = [...readyToAttack];
    for (const serverName of attackList) {
      if (canAttack(ns, serverName)) {
        ns.tprintf("   ... Considering attack on %s ...", serverName);
        const my_servers = get_my_network(ns);
        let freeRam = totalFreeRam(my_servers);
        let attackEstimate = estimateAttack(ns, serverName);
        if (attackEstimate < freeRam * 0.95) {
          ns.tprintf("HACK-CTRL: Starting attack on %s.", serverName);
          readyToAttack.delete(serverName);
          await doAttack(ns, serverName);
        }
      } else {
        ns.tprintf("   ... can't yet attack %s", serverName);
      }
    }
    await ns.sleep(5000);
  }
}