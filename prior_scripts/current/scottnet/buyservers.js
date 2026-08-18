/** @param {NS} ns */
export async function main(ns) {

  const ram = 8;
  const prefix = "s";
  for(let i=0; i < 25; i++){
    let host = prefix + (i+1);
    if(!ns.serverExists(host)){
      ns.tprintf("Bought server: %s",host);
      ns.purchaseServer(host, ram);
    }
    // ns.scp("/scottnet/share.js", host);
    // ns.exec("/scottnet/share.js", host, ram / 4);
  }
}