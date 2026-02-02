import { copy_bot_scripts, canAttack, calculateServerRatio, readyForAttack,
        } from "/scottnet/lib/core.js";
import { BotDeployment, execBotDeployment } from "/scottnet/lib/process.js";
import {setPrepStart} from "/scottnet/lib/state.js"


/** @param {NS} ns */
export async function main(ns) {
    // use flags to give option for hack / weaken only like for joesguns -- only weaken + hack
    if (ns.args.length < 1) {
        ns.tprint("attack-server <target>");
        ns.exit();
    }
    const N = 10;  // 60 - up to 120
    const target = ns.args[0];

    ns.tprintf("Preparing server %s....", target);

    const count = N;

    let deploymentConfig = new BotDeployment(target, 1);
    // deploymentConfig.addBatch("grow-prep", count, 2000, 1);
    // deploymentConfig.addBatch("grow-prep", count, 2000, 1);
    // deploymentConfig.addBatch("weaken-prep", count, 2000, 1);
    deploymentConfig.addBatch(ns, "grow-prep", count, 1000, 10);   // 10
    deploymentConfig.addBatch(ns, "weaken-prep", count, 1000, 15);  // 7
    // ns.tprintf("Deployment config: %s", JSON.stringify(deploymentConfig));
    await execBotDeployment(ns, deploymentConfig);
    setPrepStart(ns, target);
}
