import { copy_bot_scripts, canAttack, calculateServerRatio, readyForAttack,

        } from "/scottnet/lib/core.js";
import { BotDeployment, execBotDeployment } from "/scottnet/lib/process.js";


/*
    Phase 1: Prepare the target server by weakening and growing it to optimal levels
       (1A): Deploy weaken_prepbot.js and give it a chance to run for a while
       (1B): Deploy grow_prepbot.js and give allow it to work while the weaken_prepbots are still running
       phase completes when the target server is near minimum security and maximum money
    Phase 2: Launch the main attack cycle
       (2A): Continuously deploy weaken bots to keep security low
       (2B): Continuously deploy grow bots to keep money high
       (2C): Continuously deploy hack bots to steal money
*/
/** @param {NS} ns */
export async function main(ns) {
    // use flags to give option for hack / weaken only like for joesguns -- only weaken + hack
    if (ns.args.length < 1) {
        ns.tprint("attack-server <target>");
        ns.exit();
    }
    const N = 120;
    const target = ns.args[0];
    if (!readyForAttack(ns, target)) {
        ns.tprintf("Server '%s' is not ready for attack (insufficient ports or hacking level)", target);
        ns.exit();
    }

    const ratios = calculateServerRatio(ns, target);
    ns.tprintf("Calculated attack ratios for %s: %s", target, JSON.stringify(ratios));

    const hackCount = N;
    const growCount = Math.ceil(ratios.grow * N);
    const weakenCount = Math.ceil(ratios.weaken * (N + 1));

    let deploymentConfig = new BotDeployment(target, 1);
    deploymentConfig.addBatch("grow", growCount, 60000.0 / growCount);
    deploymentConfig.addBatch("weaken", weakenCount, 60000.0 / weakenCount);
    deploymentConfig.addBatch("hack", hackCount, 60000.0 / hackCount);

    ns.tprintf("Deployment config: %s", JSON.stringify(deploymentConfig));
    // await execBotDeployment(ns, deploymentConfig);
}
