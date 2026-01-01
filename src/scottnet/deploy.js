import { botMap, deploy_job } from "/scottnet/lib/process.js";


/** @param {NS} ns */
export async function main(ns) {
    const flags = ns.flags([
        ["help", false], // help flag
        ["v", false],    // verbose flag
        ["n", 1],        // number of times to deploy this job
        ["x", 1],        // deploy with x threads in each job
        ['g', 0.0],      // gap between deployments in milliseconds
        ['d', 0.0],      // delay before first deployment in milliseconds
    ]);
    if (flags.help) {
        ns.tprint("deploy [flags] <bot> [args...]");
        ns.tprint("  <bot>     The bot to deploy");
        ns.tprint("  [args...]    Arguments to pass to the script");
        ns.tprint("  --help       Show this help message");
        ns.tprint("  -v           Verbose output");
        ns.tprint("  -n <number>  Number of times to deploy this job (default: 1)");
        ns.tprint("  -x <number>  Number of threads for each deployment (default: 1)");
        ns.tprint("  -g <number>  Gap between deployments in seconds (default: 0)");
        ns.tprint("  -d <number>  Delay before first deployment in seconds (default: 0)");
        ns.exit();
    }
    const verbose = flags.v;
    const num_deployments = flags.n;
    const threads_per_deployment = flags.x;
    const gap_between_deployments = Math.floor(flags.g * 1000);
    const initial_delay = Math.floor(flags.d * 1000);
    const script = flags._[0];
    const args = flags._.slice(1);
    if (!script) {
        ns.tprint("Error: No script specified.");
        ns.exit();
    }

    if (gap_between_deployments > 0 && num_deployments < 2) {
        ns.tprintf("Warning: Gap between deployments specified but not deploying multiple job instances.");
        ns.exit();
    }
    const deployMap = deploy_job(ns, script, args, num_deployments, threads_per_deployment,
                                 initial_delay, gap_between_deployments, verbose);
}