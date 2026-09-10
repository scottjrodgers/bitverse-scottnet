/** @param {NS} ns
 * Args:
 * 0 - target server name
 * 1 - additionalMilliseconds
 **/
export async function main(ns) {
    if (ns.args.length < 4) {
        ns.tprint("Usage: weaken-task.js <target> <additionalMSec> <batchID> <targetTime>");
        ns.exit();
    }
    const target = String(ns.args[0]);
    const additionalMsec = Number(ns.args[1]);
    const batchID = Number(ns.args[2]);
    const targetTime = Number(ns.args[3]);
    const result = await ns.weaken(target, {additionalMsec: additionalMsec});
    const logFName = `/logs/hacking.${target}.json`;
    let host = 'NA';
    if (ns.args.length >= 5){
        host = ns.args[4];
    }
    ns.write(logFName, JSON.stringify(
        {
            batchID: batchID,
            task: 'weaken',
            host: host,
            additionalMsec: additionalMsec,
            targetTime: targetTime,
            actualTime: Date.now(),
            result: result
        }
    ));
}
