/** @param {NS} ns */
export async function main(ns) {

  let prevLevel = 0;
  while(true){
    const player = ns.getPlayer();
    const hackXP = player.exp.hacking;
    const hackSkill = player.skills.hacking;

    if (hackSkill != prevLevel){
      ns.write("xp-tracker.txt", ns.sprintf("%d,%d\n", hackSkill, hackXP));
    }
    prevLevel = hackSkill;
    await ns.sleep(20);
  }
}