import {get_my_network, getNetworkRam} from "./servers";
import {calculateServerRatio, copy_bot_scripts} from "./core";

export const EMPTY = "<|-EMPTY-|>";

export const botMap = {
    "weaken": "/scottnet/bots/weakenbot.js",
    "grow": "/scottnet/bots/growbot.js",
    "hack": "/scottnet/bots/hackbot.js",
    "weaken-prep": "/scottnet/bots/weaken_prepbot.js",
    "grow-prep": "/scottnet/bots/grow_prepbot.js",
    "weaken_prep": "/scottnet/bots/weaken_prepbot.js",
    "grow_prep": "/scottnet/bots/grow_prepbot.js",
    "share": "/scottnet/bots/sharebot.js",
};


export const processMap = {
    'scottnet/bots/weaken_prepbot.js': 'weaken-prep',
    'scottnet/bots/grow_prepbot.js': 'grow-prep',
    'scottnet/bots/weakenbot.js': 'weaken',
    'scottnet/bots/growbot.js': 'grow',
    'scottnet/bots/hackbot.js': 'hack',
    'scottnet/bots/sharebot.js': 'share',
}



export class ProcInfo {
    /** @param {NS} ns */
    constructor(ns, filename, procArgs, threads) {
        this.ns = ns;
        this.filename = filename
        if (filename in processMap) {
            this.shortname = processMap[filename];
        } else {
            this.shortname = filename;
        }
        this.procArgs = procArgs;
        this.key = this.shortname;
        let skip = false;
        for (let arg of procArgs) {
            if (arg == "-d") {
                skip = true;
                continue;
            }
            if (skip == true) {
                skip = false;
                continue;
            }
            this.key = ns.sprintf("%s %s", this.key, arg);
        }
        this.threads = threads;
    }

    ramUsage() {
        return this.ns.getScriptRam(this.filename) * this.threads;
    }
}


export class BotBatch {
    constructor(botType, numJobs, period, threadsPerJob=1, delay=0) {
        if (!(botType in botMap)) {
            ns.tprintf("Unknown bot type '%s'. Valid types are: %s",
                botType, Object.keys(botMap).join(", "));
            ns.exit()
        }
        this.botType = botType;
        this.numJobs = numJobs;
        this.period = period;
        this.threadsPerJob = threadsPerJob;
        this.delay = delay;
    }
}

export class BotDeployment {
    constructor(target, jobId = -1) {
        this.target = target;
        this.jobId = jobId;
        this.batches = [];
    }

    addBatch(botType, numJobs, period, threadsPerJob=1, delay=0) {
        const batch = new BotBatch(botType, numJobs, period, threadsPerJob, delay);
        this.batches.push(batch);
    }
}


/** @param {NS} ns */
export function collect_processes(ns, servers, by_server = false, grepString=EMPTY) {
    // ns.tprintf("By server: %s", by_server);
    const pids = new Map();
    for (let host of servers.keys()) {
        // ns.tprintf("Scanning processes on %s", host);
        const processes = ns.ps(host);
        for (let p of processes) {
            // ns.tprintf("  Found process: %s %s (threads: %d)", p.filename, p.args.join(" "), p.threads);
            if (p.filename.endsWith("psn.js")) {
                continue;
            }
            let filename = p.filename;
            if (by_server == true) {
                // ns.tprintf("  Aggregating by server, prefixing with host: %s", host);
                filename = ns.sprintf("%s:%s", host, p.filename);
            }
            let temp_key = p.filename;
            for (let arg of p.args) { 
              temp_key = ns.sprintf("%s %s", temp_key, arg);
            }
            if(grepString == EMPTY || temp_key.includes(grepString)){
              let process = new ProcInfo(ns, filename, p.args, p.threads);
              if (!pids.has(process.key)) {
                  pids.set(process.key, process);
              } else {
                  let existingProcess = pids.get(process.key);
                  existingProcess.threads += process.threads;
                  pids.set(existingProcess.key, existingProcess);
              }
            }
        }
    }
    return pids
}


/** @param {NS} ns */
export async function deploy_job(ns, bot, args = [], n = 1, threads = 1, delay = 0, gap = 0, verbose = false) {
    // Future: could split a large thread count into smaller counts on different servers
    if (!(bot in botMap)) {
        ns.tprintf("Error: Unknown bot type '%s'. Valid types are: %s",
            bot, Object.keys(botMap).join(", "));
        return false;
    }
    const script = botMap[bot];
    const servers = getNetworkRam(ns);
    // ns.tprintf(JSON.stringify(servers));
    const script_ram = ns.getScriptRam(script) * threads;
    let serverRam = 0;
    for (const server of servers) {
        serverRam += server.freeRam;
    }
    if (verbose) {
        ns.tprintf("Deploying bot: %s", bot);
        ns.tprintf("RAM needed per instance: %d GB", script_ram);
        ns.tprintf("Arguments: [%s]", args.join(", "));
        ns.tprintf("Number of deployments: %d", n);
        ns.tprintf("Threads per deployment: %d", threads);
        ns.tprintf("Initial delay before first deployment: %d ms", delay);
        ns.tprintf("Gap between deployments: %s ms", gap);
        ns.tprintf("Total network RAM: %s", serverRam);
    }
    let sorted_availability = [];
    let spaces = 0;
    for(const ramData of servers) {
        const name = ramData.name;
        const freeRam = ramData.freeRam;
        const max_deployments = Math.floor(freeRam / script_ram);
        copy_bot_scripts(ns, name);

        if (max_deployments > 0) {
            spaces += max_deployments;
            sorted_availability.push([name, max_deployments]);
            if(verbose){
                ns.tprintf("Server %s has %d GB free RAM, can deploy %d instances of %s with %d threads each.",
                    name, freeRam, max_deployments, script, threads);
            }
        }
    }
    if (spaces < n) {
        ns.tprintf("Error: Not enough available RAM to deploy %d instances of %s with %d threads each. Available slots: %d",
            n, script, threads, spaces);
        return false;
    }
    // for (const [name, max_deployments] of sorted_availability) {
    //     ns.tprintf("server: %s, space for %d deployments", name, max_deployments);
    // }

    let deployMap = new Map();
    let server_index = 0;
    let spacesLeft = sorted_availability[server_index][1];
    let serverName = sorted_availability[server_index][0];

    for (let i = 0; i < n; i++) {
        if (spacesLeft < 1) {
            server_index += 1;
            serverName = sorted_availability[server_index][0];
            spacesLeft = sorted_availability[server_index][1];
        }
        if (!deployMap.has(serverName)){
            deployMap.set(serverName, 0);
        }
        deployMap.set(serverName, deployMap.get(serverName) + 1);
        ns.exec(script, serverName, threads, ...args, "-d", delay + i * gap);
        spacesLeft -= 1;
    }
    // ns.tprintf("Successfully deployed %d instances of %s with %d threads each, using ",
        // n, script, threads, ns.formatRam(n * script_ram));
    return deployMap;
}


/** @param {NS} ns */
export function execBotDeployment(ns, deployment, verbose = false) {
    for (let batch of deployment.batches) {
        if (verbose) {
            ns.tprintf("Deploying batch: %s, numJobs: %d, period: %d, threadsPerJob: %d",
                batch.botType, batch.numJobs, batch.period, batch.threadsPerJob);
        }
        const deployMap = deploy_job(ns, batch.botType, [deployment.target], batch.numJobs, batch.threadsPerJob,
            batch.delay, batch.period, verbose);
    }
}

/** @param {NS} ns */
export function deployPrepareBots(ns, target, ramLimit) {
    const ratios = calculateServerRatio(ns, target);
}
