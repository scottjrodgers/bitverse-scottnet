/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["d", 0],       // delay before starting
    ]);
    const args = flags._;
    if (args.length < 1) {
        ns.tprint("Usage: grow_prepbot <target> [-d delay_ms]");
        ns.exit();
    }
    const delay = flags.d;
    const target = args[0]
    if (delay > 0) {
        await ns.sleep(delay);
    }
    while(ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * 0.98){
        await ns.grow(target);
    }
}