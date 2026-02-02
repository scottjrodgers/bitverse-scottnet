import {shell} from "/scottnet/lib/core.js";


async function setAlias(name, command){
    const shell_command = `alias ${name}="${command}"`;
    await shell(shell_command);
}

/** @param {NS} ns */
export async function main(ns) {
    await setAlias("wp", "nano");
    await setAlias("ll", "ls -l");
    await setAlias("scan", "run /scottnet/scan.js");
    await setAlias("nuke", "NUKE.exe");
    await setAlias("ssh", "BruteSSH.exe");
    await setAlias("ftp", "FTPCrack.exe");
    await setAlias("smtp", "relaySMTP.exe");
    await setAlias("worm", "run /scottnet/worm.js");
    await setAlias("paths", "run /scottnet/paths.js");
    await setAlias("deploy_bots", "run /bots/deploy_bots.js");
    await setAlias("attack_server", "run /hgw/attack_server.js");
    await setAlias("add-hud", "run /scottnet/hud.js");
    await setAlias("go", "run /scottnet/go.js");
    await setAlias("nuked", "run /scottnet/whats-nuked.js");
    await setAlias("attack-server", "run /scottnet/attack_server.js");
    await setAlias("nukem", "run /scottnet/nukem.js");
    await setAlias("psn", "run /scottnet/psn.js");
    await setAlias("deploy", "run /scottnet/deploy.js");
    await setAlias("spsn", "run /scottnet/psn.js --server");
}
