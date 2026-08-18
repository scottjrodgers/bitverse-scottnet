/** @param {NS} ns */
export function copy_bot_scripts(ns, host) {
    ns.scp("/scottnet/bots/weakenbot.js", host);
    ns.scp("/scottnet/bots/growbot.js", host);
    ns.scp("/scottnet/bots/hackbot.js", host);
    ns.scp("/scottnet/bots/weaken_prepbot.js", host);
    ns.scp("/scottnet/bots/grow_prepbot.js", host);
    ns.scp("/scottnet/bots/sharebot.js", host);
}


/** @param {NS} ns */
export function canAttack(ns, target) {
    let server = ns.getServer(target);
    let hackSkill = ns.getHackingLevel();
    let reqdHacking = server.requiredHackingSkill;
    let adminRights = server.hasAdminRights;
    if (!adminRights) {
        ns.tprintf("Cannot attack %s: no admin rights", target);
        return false;
    }
    if (hackSkill < reqdHacking) {
        ns.tprintf("Cannot attack %s: hacking skill %d < required %d", target, hackSkill, reqdHacking);
        return false;
    }
    return true;
}


/** @param {NS} ns */
export function calculateServerRatio(ns, target){
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);
    const e_hack = ns.hackAnalyze(target);
    const e_grow = ns.growthAnalyze(target, 1.01, 1);
    const e_weaken = ns.weakenAnalyze(1, 2);
    // const es_hack = ns.hackAnalyzeSecurity(1, target);
    // const es_grow = ns.growthAnalyzeSecurity(1, target, 2);
    const es_hack = 0.002;
    const es_grow = 0.004;
    const growPerHack = (100 * e_grow * e_hack);
    const weakenPerHack = (es_hack + (growPerHack * es_grow)) / e_weaken;
    const growJobsPerHack = growPerHack * growTime / hackTime;
    const weakenJobsPerHack = weakenPerHack * weakenTime / hackTime;

    // Adding a 10% safety margin on grow and weaken
    return {
        hack: 1,
        grow: growJobsPerHack * 2,
        weaken: weakenJobsPerHack * 1.6,
        growDelay: weakenTime - growTime + 1000,
        hackDelay: weakenTime - hackTime + 2000,
    };
}


/** @param {NS} ns */
export function readyForAttack(ns, target){
    let ready = true;
    if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.85){
        ns.tprintf("Server '%s' not at optimal money levels.", target);
        ready = false;
    }
    if (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target) * 1.15) {
        ns.tprintf("Server '%s' not at optimal security levels.", target);
        ready = false;
    }
    return ready;
}


export async function shell(cmd) {
    // Template code from the official documentation of Bitburner:
    //
    // https://bitburner-official.readthedocs.io/en/latest/netscript/advancedfunctions/inject_html.html
    const input = globalThis["document"].getElementById("terminal-input"); // eslint-disable-line
    input.value = cmd;
    const handler = Object.keys(input)[1];
    input[handler].onChange({
        target: input,
    });
    input[handler].onKeyDown({
        key: "Enter",
        preventDefault: () => null,
    });
}