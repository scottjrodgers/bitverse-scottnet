import { bool_t } from "/quack/lib/constant/bool.js";
import { wse_t } from "/quack/lib/constant/wse.js";
import { log } from "/quack/lib/log.js";
import { can_short, initial_portfolio, transaction } from "/quack/lib/wse.js";


function shush(ns) {
    ns.disableLog("getServerMoneyAvailable");
    ns.disableLog("sleep");
}

async function log_market(ns, fname, counter){
  const symbols = ns.stock.getSymbols();
  const date = new Date(Date.now()).toISOString();
  for(let s of symbols){
    const price = ns.stock.getPrice(s);
    // ns.write(fname, ns.sprintf("%s,%s,%s,%s,%s\n", date, s, price, forecast, volatility), "a");
    ns.write(fname, ns.sprintf("%d,%s,%s,%s\n", counter, date, s, price), "a");
  }
}

export async function main(ns) {
  shush(ns);

  log(ns, "Collecting data on the Stock Market");
  const date = new Date(Date.now()).toISOString();
  const fname=ns.sprintf("logs/market_%s.txt", date);

  let counter = 0;
  // ns.write(fname, "date,symbol,price,prob_grow,volatility\n");  // "a"
  ns.write(fname, "n,date,symbol,price\n");  // "a"
  for (;;) {
    await log_market(ns, fname, counter);
    await ns.stock.nextUpdate();
    counter += 1;
  }
}