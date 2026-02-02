import {CommCenter} from "/dev/communications.js";

/** @param {NS} ns */
export async function main(ns) {

  const data = [1, 2, 3, 4, 5];

  const coms1 = new CommCenter(ns, "d1");
  const coms2 = new CommCenter(ns, "d2");

  coms1.sendMessage('d2', data, 'test');
  coms2.checkPort();
  const incoming = coms2.getMessagesByType('test');
  for(const msg of incoming){
    const d = msg.data;
    ns.tprintf("%s", JSON.stringify(d));
  }
}