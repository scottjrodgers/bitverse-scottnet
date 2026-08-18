/** @param {NS} ns */
export async function main(ns) {
    if (ns.args.length < 1) {
        ns.tprint("Usage: grow.js <target>");
        ns.exit();
    }
    const target = ns.args[0];
    await ns.grow(target);
}