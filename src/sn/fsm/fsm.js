export class Context {
  constructor(ns) {
    this.ns = ns;

    // soft coordination flags (from ports / files)
    this.flags = {
      preparingAugInstall: false,
      needsMoney: false,
      ramConstrained: false
    };
  }

  // convenience getters
  get money() {
    return this.ns.getServerMoneyAvailable("home");
  }

  get ram() {
    return this.ns.getServerMaxRam("home");
  }

  get hack() {
    return this.ns.getHackingLevel();
  }
}


export function makeState({
  name,
  canEnter = () => true,
  onEnter = () => {},
  tick,
  shouldExit = () => false,
  onExit = () => {}
}) {
  return {
    name,
    canEnter,
    onEnter,
    tick,
    shouldExit,
    onExit
  };
}


export function makeParentState({
  name,
  canEnter = () => true,
  shouldExit = () => false,
  children
}) {
  const machine = new StateMachine(children);

  return {
    name,
    canEnter,
    shouldExit,
    onEnter(ctx) {
      machine.current = null;
    },
    async tick(ctx) {
      await machine.tick(ctx);
    }
  };
}


export class StateMachine {
  constructor(states) {
    this.states = states;
    this.current = null;
  }

  async tick(ctx) {
    if (!this.current || this.current.shouldExit(ctx)) {
      const next = this.states.find(s => s.canEnter(ctx));
      if (next !== this.current) {
        this.current?.onExit?.(ctx);
        this.current = next;
        this.current?.onEnter?.(ctx);
      }
    }

    await this.current?.tick(ctx);
  }
}


function emitSignal(ns, signal) {
  ns.writePort(1, JSON.stringify(signal));
}

// example
// emitSignal(ns, { type: "PREP_AUG_INSTALL", value: true });

function readSignals(ns, ctx) {
  while (true) {
    const raw = ns.readPort(1);
    if (raw === "NULL PORT DATA") break;

    const msg = JSON.parse(raw);
    if (msg.type === "PREP_AUG_INSTALL") {
      ctx.flags.preparingAugInstall = msg.value;
    }
  }
}

/*
--------------------------------------------
     Sample usage script:
--------------------------------------------

import { makeState, makeParentState, StateMachine} from "./fsm.js";
import { Context } from "./context.js";


const isEarlyHack = ctx => ctx.hack < 50;
const isReadyToFarm = ctx => ctx.hack >= 50;

const actions = {
  trainHack: async ctx => {
    await ctx.ns.universityCourse("Rothman University", "Algorithms");
  },

  farmMoney: async ctx => {
    // placeholder HWGW loop
    await ctx.ns.sleep(1000);
  }
};


const bootstrapHack = makeState({
  name: "BootstrapHack",
  canEnter: isEarlyHack,
  tick: actions.trainHack,
  shouldExit: isReadyToFarm
});

const moneyHack = makeState({
  name: "MoneyHack",
  canEnter: isReadyToFarm,
  tick: actions.farmMoney
});

const hackingState = makeParentState({
  name: "Hacking",
  canEnter: ctx => !ctx.flags.preparingAugInstall,
  shouldExit: ctx => ctx.flags.preparingAugInstall,
  children: [
    bootstrapHack,
    moneyHack
  ]
});



export async function main(ns) {
  const ctx = new Context(ns);
  const machine = new StateMachine([hackingState]);

  while (true) {
    // read signals (ports/files)
    readSignals(ns, ctx);

    await machine.tick(ctx);
    await ns.sleep(200);
  }
}

*/