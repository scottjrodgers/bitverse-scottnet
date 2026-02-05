import { BaseDaemon } from "/sn/lib/base_daemon.js";


export class ToolsDaemon extends BaseDaemon {
  /**
   * 
   * @param {NS} ns 
   */
  constructor(ns) {
    super(ns, "tools");
    this.period = 5000; // Check every 30 seconds
  }

  async loopBody() {
    // TODO: Check for messages

    // Check for tool availability
    const cash = this.ns.getPlayer().money;

    if (this.ns.singularity.purchaseTor()) {
      const dwProgs = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
      ];
      const progsToBuy = dwProgs.filter(p => !this.ns.fileExists(p, "home"));
      for (const prog of progsToBuy) {
        const cost = this.ns.singularity.getDarkwebProgramCost(prog);
        this.ns.tprintf("trying: %s at $%d, with $%d as cash", prog, cost, cash);
        if (cash >= cost) {
          this.ns.singularity.purchaseProgram(prog);
          this.ns.tprint(`ToolsDaemon: Purchased ${prog} for $${cost.toLocaleString()}`);
        }
      }
    } else {
      ns.tprintf("Else clause");
    }
  }
}


/** @param {NS} ns */
export async function main(ns) {
  const daemon = new ToolsDaemon(ns);
  await daemon.run();
}
