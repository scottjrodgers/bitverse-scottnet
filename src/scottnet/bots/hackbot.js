/** @param {NS} ns **/
export async function main(ns) {
    const flags = ns.flags([
        ["d", 0],       // delay before starting
    ]);
    const args = flags._;
    if (args.length < 1) {
        ns.tprint("Usage: hackbot.js <target> [-d delay_ms]");
        ns.exit();
    }
    const delay = flags.d;
    const target = args[0]
    if (delay > 0) {
        await ns.sleep(delay);
    }
    while (true) {
        let x = "Bitburner";
        await ns.hack(target);
    }
}

