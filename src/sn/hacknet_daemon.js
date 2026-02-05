import {BaseDaemon} from "/sn/lib/base_daemon.js";


export class HacknetDaemon extends BaseDaemon{
    /**
     * 
     * @param {NS} ns 
     */
    constructor(ns){
        super(ns, "hacknet");
        this.cashBucket = 0;
        this.extrasBucket = 0;
        ns.disableLog("sleep");
    }

    captureGeneratedHashes(delta){
        const maxHashes = this.ns.hacknet.hashCapacity();
        const numHashes = this.ns.hacknet.numHashes();
        const hashPercent = numHashes / maxHashes;
        const productionRate = getHashRate(this.ns);
        const extrasPortion = 0.333 * hashPercent ** 2.5;
        const cashPortion = hashPercent - extrasPortion;
        this.cashBucket += cashPortion * productionRate * delta;
        this.extrasBucket += extrasPortion * productionRate * delta;
    }

    tradeForCash(){
        let cashPurchases = 0;
        while(cashBucket > 4){
            cashPurchases += 1;
            cashBucket -= 4;
        }
        while(extrasBucket > 4){
            cashPurchases += 1;
            extrasBucket -= 4;
        }
        if (cashPurchases > 0){
            this.ns.printf("purchase Cash: %d times.", cashPurchases);
            this.ns.hacknet.spendHashes("Sell for Money", undefined, cashPurchases);
        }
    }

    // Override
    async startUp(){
        this.previousTime = performance.now();
    }

    // Override
    async loopBody(){
        const newTime = performance.now();
        let delta = (newTime - previousTime) / 1000;
        previousTime = newTime;

        // TODO: Check for messages

        // Process our hashes
        this.captureGeneratedHashes(delta);
        this.tradeForCash();

        // to grow the net
        
    }
}


/** @param {NS} ns */
export async function main(ns) {
    const daemon = new ToolsDaemon(ns);
    await daemon.run();
}