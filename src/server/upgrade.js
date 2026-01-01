/** @param {NS} ns */
export async function main(ns) {
  let new_ram = 16384;
  if(ns.args.length > 0){
    new_ram = ns.args[0] * 1024;
  }
  const my_servers = ns.getPurchasedServers();
  for(let srv of my_servers){
    const curr_ram = ns.getServerMaxRam(srv);
    if(new_ram > curr_ram){ 
      let delta = new_ram - curr_ram;
      let n_shares = delta / 4;
      ns.upgradePurchasedServer(srv, new_ram);
      ns.exec("/scripts/share.js", srv, n_shares);
      ns.tprintf("Upgraded %s to %d GB.", srv, new_ram);
    }
  }
}