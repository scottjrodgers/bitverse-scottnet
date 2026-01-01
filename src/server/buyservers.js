/** @param {NS} ns */
export async function main(ns) {

  const ram = 512;
  const prefix = "s";
  for(let i=0; i < 8; i++){
    let host = prefix + (i+1);
    ns.purchaseServer(host, ram);
    ns.scp("/scripts/share.js", host);
    ns.exec("/scripts/share.js", host, 128);
  }
}