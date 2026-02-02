import { BotDeployment, execBotDeployment } from "/scottnet/lib/process.js";
import { setAttackBegun } from "/scottnet/lib/state.js"

/*
  Starting out, I do every 2 seconds over period given as parameters, moving to every second, and eventually every 0.5 sec.
  Threads:
    With low ram:  1W, 1G, 1H.  This is also at a period where that is a proper balance between the three
*/
export async function main(ns) {
  // use flags to give option for hack / weaken only like for joesguns -- only weaken + hack
  if (ns.args.length < 4) {
    ns.tprintf("attack-server <target> <weaken-count> <grow-count> <hack-count>");
    ns.exit();
  }

  const hps = 1;
  const target = ns.args[0];
  const weakenCount = Math.ceil(ns.args[1] * hps) + 1;
  const growCount = Math.ceil(ns.args[2] * hps) + 1;
  const hackCount = Math.ceil(ns.args[3] * hps);
  const growDelay = (weakenCount - growCount) / hps;
  const hackDelay = (weakenCount - hackCount) / hps;

  let deploymentConfig = new BotDeployment(target, 1);
  deploymentConfig.addBatch(ns, "weaken", weakenCount * 1, 1000, 1);  // 1
  deploymentConfig.addBatch(ns, "grow", growCount * 1, 1000, 3, growDelay);  // 2
  deploymentConfig.addBatch(ns, "hack", hackCount, 1000, 1, hackDelay);  // 1

  // ns.tprintf("Deployment config: %s", JSON.stringify(deploymentConfig));
  ns.tprintf("Attacking %s", target);
  await execBotDeployment(ns, deploymentConfig);
  setAttackBegun(ns, target);
}
