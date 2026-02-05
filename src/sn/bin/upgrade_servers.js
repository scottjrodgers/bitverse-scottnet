/** @param {NS} ns */
export async function main(ns) {
  let new_ram = 32;
  if(ns.args.length > 0){
    new_ram = ns.args[0];
  }
  const my_servers = ns.getPurchasedServers();
  for(let srv of my_servers){
    const curr_ram = ns.getServerMaxRam(srv);
    if(new_ram > curr_ram){ 
      let delta = new_ram - curr_ram;
      ns.upgradePurchasedServer(srv, new_ram);
      ns.tprintf("Upgrade server %s to %s", srv, ns.formatRam(new_ram));
      // ns.scp("/scottnet/share.js", srv);
      // ns.exec("/scottnet/share.js", srv, delta / 4);
    }
  }
}