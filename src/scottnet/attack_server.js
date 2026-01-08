import { BotDeployment, execBotDeployment } from "/scottnet/lib/process.js";
import {setAttackBegun} from "/scottnet/lib/state.js"

export async function main(ns) {
    // use flags to give option for hack / weaken only like for joesguns -- only weaken + hack
    if (ns.args.length < 4) {
        ns.tprintf("attack-server <target> <weaken-count> <grow-count> <hack-count>");
        ns.exit();
    }
    const target = ns.args[0];
    const weakenCount = ns.args[1];
    const growCount = ns.args[2];
    const hackCount = ns.args[3];
    const growDelay = (weakenCount - growCount) * 1000;
    const hackDelay = (weakenCount - hackCount) * 1000;

    let deploymentConfig = new BotDeployment(target, 1);
    deploymentConfig.addBatch("weaken", weakenCount, 1000, 4);  // 1
    deploymentConfig.addBatch("grow", growCount, 1000, 7, growDelay);  // 2
    deploymentConfig.addBatch("hack", hackCount, 1000, 2, hackDelay);  // 1

    // ns.tprintf("Deployment config: %s", JSON.stringify(deploymentConfig));
    ns.tprintf("Attacking %s", target);
    await execBotDeployment(ns, deploymentConfig);
    setAttackBegun(ns, target);
}
