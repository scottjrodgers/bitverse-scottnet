
// async function findBestF(ns, preppedServer, player, cores){
//     const pctPer = ns.formulas.hacking.hackPercent(preppedServer, player);
//     let best = null;
//
//     // Min pctHacked = pctPer, max = 60%
//     const maxPct = 0.65;
//     const steps = 100;
//     const range = (maxPct - pctPer);
//     const step = range / steps;
//     for (let f=pctPer; f<=maxPct; f=f+step){
//         const b = sizeBatch(f, preppedServer, player, cores);
//         const bScore = (b.fActual * hackChance) / b.batchRam
//         if(bScore > best.score){
//             let best = {f:f, b:b, score:bScore}
//         }
//     }
//
// }

function sizeBatch(ns, target, targetPortion) {
    const GROW_PAD = 1.1;
    const live = ns.getServer(target)
    const p = ns.getPlayer()

    const hackTime = ns.formulas.hacking.hackTime(live, p);
    const prepped = ns.getServer(target);
    prepped.hackDifficulty = live.minDifficulty;
    prepped.moneyAvailable = live.moneyMax;

    const cores = 1;
    const wPer = ns.weakenAnalyze(1, cores);

    const pctPer = ns.formulas.hacking.hackPercent(prepped, p);
    const hackThreads = Math.max(1, Math.floor(targetPortion / pctPer));
    const hackPortion = hackThreads * pctPer;

    const afterHack = ns.getServer(target);
    afterHack.hackDifficulty = live.minDifficulty;
    afterHack.moneyAvailable = prepped.moneyMax * (1 - hackPortion);

    const growThreads = Math.ceil(ns.formulas.hacking.growThreads(afterHack, p, prepped.moneyMax, cores)
        * GROW_PAD);
    const weaken1Threads = Math.max(1, Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / wPer));
    const weaken2Threads = Math.max(1, Math.ceil(ns.growthAnalyzeSecurity(growThreads, target, cores) / wPer));

    const batchRam = hackThreads * 1.70 + growThreads * 1.75 + (weaken1Threads + weaken2Threads) * 1.75;

    return {hackTime, hackThreads, growThreads, weaken1Threads, weaken2Threads, hackPortion, batchRam}
}

function calculateBatchLaunchTime(ns, targetTime, hackTime, period, gap){
    const j = 1 + Math.floor((0.5 * period + 0.5 * gap + 4 * hackTime) / period);
    return targetTime + (3 * gap + period) / 2 - j * period;
}

function launchBatch(ns, target, host, targetTime, stealPortion, gap, batchID) {
    const {hackTime,
           hackThreads,
           growThreads,
           weaken1Threads,
           weaken2Threads,
           hackPortion,
           batchRam} = sizeBatch(ns, target, stealPortion);

    // TODO: check that the host server has enough available RAM, if not, return a message for skipped due to RAM
    const now= Date.now();
    const hackMs = targetTime - now - hackTime;
    const weaken1Ms = targetTime + gap - now - (4 * hackTime);
    const growMs = targetTime + (2 * gap) - now - (3.2 * hackTime);
    const weaken2Ms = targetTime + (3 * gap) - now - (4 * hackTime);
    const hackResult = ns.exec("/hacking/hack-task.js", host, hackThreads, target, hackMs,
        batchID, targetTime);
    const weaken1Result = ns.exec("/hacking/weaken-task.js", host, weaken1Threads, target, weaken1Ms,
        batchID, targetTime + gap);
    const growResult = ns.exec("/hacking/grow-task.js", host, growThreads, target, growMs,
        batchID, targetTime + 2 * gap);
    const weaken2Result = ns.exec("/hacking/weaken-task.js", host, weaken2Threads, target, weaken2Ms,
        batchID, targetTime + 3 * gap);
    return {h: hackResult, w1: weaken1Result, g: growResult, w2: weaken2Result, ram: batchRam};
}

function calculatePeriod(ns, target, stealPortion, gap, ramBudget){
    let done = false;
    let inFlightWanted = 0;
    let hT = 0;
    while (!done){
        const {hackTime, hackThreads, growThreads, weaken1Threads,
            weaken2Threads, hackPortion, batchRam} = sizeBatch(ns, target, stealPortion);
        if(batchRam > ramBudget){
            stealPortion *= 0.5;
        } else {
            done = true;
            hT = hackTime;
            inFlightWanted = Math.floor(ramBudget / batchRam);
        }
    }
    let P = Math.floor((4 * hT + 3 * gap) / inFlightWanted);
    return Math.max(P, 5 * gap);
}

export async function main(ns){
    if (ns.args.length < 3) {
        ns.tprint("Usage: hack-task.js <target> <ramBudget> <stealPortion>");
        ns.exit();
    }
    const target = String(ns.args[0]);
    const ramBudget = Number(ns.args[1]);
    const host='home';
    const stealPortion = Number(ns.args[2]);
    const {hackTime, hackThreads, growThreads, weaken1Threads, weaken2Threads, hackPortion, batchRam} =
        sizeBatch(ns, target, stealPortion);
    ns.tprint(`Target: ${target}, stealPortion: ${stealPortion}`);
    ns.tprint(`  hackTime: ${hackTime}`);
    ns.tprint(`  hackThreads: ${hackThreads}`);
    ns.tprint(`  growThreads: ${growThreads}`);
    ns.tprint(`  weaken1Threads: ${weaken1Threads}`);
    ns.tprint(`  weaken2Threads: ${weaken2Threads}`);
    ns.tprint(`  hackPortion: ${hackPortion}`);
    ns.tprint(`  batchRam: ${batchRam}`);
    const now = Date.now();
    const gap = 250;
    const period = calculatePeriod(ns, target, stealPortion, gap, 22.0);
    ns.tprint(`  Period: ${period}`);
    const T0 = now + 2000 - calculateBatchLaunchTime(ns, 0, hackTime, period, gap);

    let done = false;
    let k = 0;
    while (!done){
        const targetTime = T0 + k * period;
        const launchTime = calculateBatchLaunchTime(ns, targetTime, hackTime, period, gap);
        const delta = launchTime - Date.now();
        if(delta > 0) {
            await ns.sleep(delta);
            const result = launchBatch(ns, "n00dles", "home",
                targetTime, stealPortion, gap, 1000 + k);
            ns.tprint(result);
        }
        k += 1;
    }
}
