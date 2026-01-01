/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["d", 0],       // delay before starting
        ["x", 1],       // number of threads
        ["s", "home"],  // server to run on
    ]);

    // ns.tprint(JSON.stringify(flags));

    const delay = flags.d;
    const threads = flags.x;
    const script = flags._[0];
    const server = flags.s;
    const args = flags._.slice(1);

    // ns.tprintf("Script: %s", script);
    // ns.tprintf("Args: [%s]", args.join(", "));
    // ns.tprintf("Server: %s", server);
    // ns.tprintf("Threads: %d", threads);
    // ns.tprintf("Delay: %d ms", delay);

    if (!script) {
        ns.tprint("Usage: delayed_spawn <script> [args...] -s <server> -d <delay_ms> -x <threads> ");
        ns.exit();
    }
    await ns.sleep(delay);
    ns.exec(script, server, threads, ...args);
}