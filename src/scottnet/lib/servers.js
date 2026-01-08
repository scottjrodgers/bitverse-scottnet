/** @param {NS} ns */
/*
 *  Server module
 *    - Server class
 *      - Max RAM
 *      - Used RAM
 *      - Required hack level to Hack
 *      - Required ports to nuke
 *      - Which ports are open
 *      - Root access?
 *      - Backdoor?
 *      - shortest path from home
 *    - Server Manager class
 */
export class ServerNode {
    constructor(ns, name, prev) {
        this.ns = ns;
        this.name = name;
        this.set_prev(prev);
        this.shortest_path = [];
        this.serverRecord = this.ns.getServer(name);

        // initialize derived fields from serverRecord
        this.hackReqd = this.serverRecord.requiredHackingSkill;
        this.portsReqd = this.serverRecord.numOpenPortsRequired;
    }

    set_prev(prev = undefined) {
        this.prev = prev;
        if (prev === undefined) {
            this.depth = 0;
        } else {
            this.depth = this.prev.depth + 1;
        }
    }

    maxRam() {
        return this.serverRecord.maxRam;
    }

    freeRam() {
        return this.serverRecord.maxRam - this.serverRecord.ramUsed;
    }

    howManyFit(memSize) {
        return Math.floor(this.freeRam() / memSize);
    }

    hasRootAccess() {
        return this.serverRecord.hasAdminRights;
    }

    hasBackdoor() {
        return this.serverRecord.backdoorInstalled;
    }

    numOpenPorts() {
        const ns = this.ns;
        const host = this.name;
        let openPorts = 0;

        if (this.serverRecord.sshPortOpen) {
            openPorts += 1;
        } else if (ns.fileExists("BruteSSH.exe", "home")) {
            ns.brutessh(host);
            openPorts += 1;
        }

        if (this.serverRecord.ftpPortOpen) {
            openPorts += 1;
        } else if (ns.fileExists("FTPCrack.exe", "home")) {
            ns.ftpcrack(host);
            openPorts += 1;
        }

        if (this.serverRecord.smtpPortOpen) {
            openPorts += 1;
        } else if (ns.fileExists("RelaySMTP.exe", "home")) {
            ns.relaysmtp(host);
            openPorts += 1;
        }

        if (this.serverRecord.httpPortOpen) {
            openPorts += 1;
        } else if (ns.fileExists("HTTPWorm.exe", "home")) {
            ns.httpworm(host);
            openPorts += 1;
        }

        if (this.serverRecord.sqlPortOpen) {
            openPorts += 1;
        } else if (ns.fileExists("SQLInject.exe", "home")) {
            ns.sqlinject(host);
            openPorts += 1;
        }

        return openPorts;
    }

    nuke() {
        if (this.hasRootAccess()) {
            return true;
        }
        if (this.numOpenPorts() >= this.portsReqd) {
            this.ns.nuke(this.name);
            return true;
        }
        return false;
    }

    print() {
        this.ns.tprintf(
            "Server: %s, Max RAM: %d, Free RAM: %d, Hack Req: %d, Ports Req: %d, Has Root: %s, Has Backdoor: %s",
            this.name,
            this.maxRam(),
            this.freeRam(),
            this.hackReqd,
            this.portsReqd,
            this.hasRootAccess(),
            this.hasBackdoor()
        );
    }
}

/** @param {NS} ns */
function walk(ns, name, servers, previous=undefined){
    // ns.tprintf("target: %s, typeof(target): %s --- %s, %s", target, typeof(target), typeof(target) == "string", typeof(target) === String);
    let new_server = new ServerNode(ns, name, previous);
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
    let neighbors = ns.scan(name);
    for(let s of neighbors){
        walk(ns, s, servers, this_server);
    }
}

/** @param {NS} ns */
export function totalRam(servers){
    let total = 0;
    for (let [name, server] of servers) {
        total += server.maxRam();
    }
    return total;
}

/** @param {NS} ns */
export function totalFreeRam(servers){
    let total = 0;
    for (let [name, server] of servers) {
        total += server.freeRam();
    }
    return total;
}

/** @param {NS} ns */
export function get_network(ns){
    const start = "home"
    const servers = new Map();
    walk(ns, start, servers);
    return servers;
}

/** @param {NS} ns */
export function get_my_network(ns){
    const start = "home"
    const servers = get_network(ns);
    const my_servers = new Map();
    for (let [name, server] of servers) {
        if (ns.getServer(name).hasAdminRights) {
            my_servers.set(name, server);
        }
    }
    return my_servers;
}

/** @param {NS} ns */
export function getNetworkRam(ns){
    const my_servers = get_my_network(ns);
    const availability = [];
    const home_ram = Math.max(0, ns.getServerMaxRam("home") - ns.getServerUsedRam("home") - 8); // leave 16GB free on home
    for (let [name, server] of my_servers) {
        const free_ram = server.freeRam();
        // ns.tprintf("Server: %s, Ram: %d", name, free_ram);
        if (name != "home") {
            availability.push({"name": name, "freeRam":free_ram});
        }
        // ns.tprintf("dbg: %s", JSON.stringify(availability));
    }
    // try to fill the smaller spaces first
    let sorted_availability = availability.sort((a, b) => a['freeRam'] - b['freeRam']);
    sorted_availability.push({name: 'home', freeRam: home_ram});

    for(let data of sorted_availability){
      let name = data.name;
      let ram = data.freeRam;
      // ns.tprintf("Ram: %s -> %s", name, ram);
    }

    return sorted_availability;
}

