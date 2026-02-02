class BladeRunner {
  try
}

function skillUpgrade(ns, targetSkill){
  let success = ns.bladeburner.upgradeSkill(targetSkill);
  return success;
}


/** @param {NS} ns */
export async function main(ns) {

  // some commands for bladeburner
  let action = ns.bladeburner.getCurrentAction();
  let rank = ns.bladeburner.getRank();
  let points = ns.bladeburner.getSkillPoints();
  let upgradeCost = ns.bladeburner.getSkillUpgradeCost("Blade's Intuition");

  let activeGroup = 'Operations';
  let activeTask = 'Investigation';
  let highPct = 0.97;
  let lowPct = 0.90;

  const skills = ["Overclock", "Hyperdrive"];
  let skillIndex = 0;

  let [currentStamina, maxStamina] = ns.bladeburner.getStamina();
  while(true){
    let retCode = ns.bladeburner.startAction(activeGroup, activeTask);
    while(currentStamina > maxStamina * lowPct){
      await ns.bladeburner.nextUpdate();
      if(skillUpgrade(ns, skills[skillIndex])){
        skillIndex = 1 - skillIndex;
      }
      [currentStamina, maxStamina] = ns.bladeburner.getStamina();
    }
    // let tetradsRep = ns.singularity.getFactionRep("Tetrads");
    // let tianDiHuiRep = ns.singularity.getFactionRep("Tian Di Hui");
    let factionRep = ns.singularity.getFactionRep("Chongqing");
    // ns.printf("Depleted stamina.  Tian Di Hui rep @ %d", tianDiHuiRep);
    if (factionRep < 38001){
      // ns.printf("Starting faction work");
      ns.singularity.workForFaction("Chongqing", "security", false);
    } else {
      let retCode = ns.bladeburner.startAction("General", "Training");
    }
    while(currentStamina < maxStamina * highPct){
      await ns.bladeburner.nextUpdate();
      if(skillUpgrade(ns, skills[skillIndex])){
        skillIndex = 1 - skillIndex;
      }
      [currentStamina, maxStamina] = ns.bladeburner.getStamina();
    }
    await ns.bladeburner.nextUpdate();
  }
}