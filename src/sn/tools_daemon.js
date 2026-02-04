import {BaseDaemon} from "src/sn/lib/base_daemon.js";


export class ToolsDaemon extends BaseDaemon{
    /**
     * 
     * @param {NS} ns 
     */
    constructor(ns){
        super(ns, "tools");
        this.ns = ns;
    }

    async loopBody(){
        // TODO: Check for messages

        // Check for tool availability
        const cash = this.ns.getPlayer().money;

        if(this.ns.singularity.purchaseTor()){
            const dwProgs = this.ns.singularity.getDarkwebPrograms();        
            const progsToBuy = dwProgs.filter(p => !this.ns.fileExists(p, "home"));
            for(const prog of progsToBuy){
                const cost = this.ns.singularity.getDarkwebProgramCost(prog);
                if(cash >= cost){
                    this.ns.singularity.purchaseProgram(prog);
                    this.ns.tprint(`ToolsDaemon: Purchased ${prog} for $${cost.toLocaleString()}`);
                }
            }
        }
    }
}


/** @param {NS} ns */
export async function main(ns) {
    const daemon = new ToolsDaemon(ns);
    await daemon.run();
}