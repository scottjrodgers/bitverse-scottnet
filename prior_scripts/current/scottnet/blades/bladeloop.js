function skillUpgrade(ns, targetSkill){
  let success = ns.bladeburner.upgradeSkill(targetSkill);
  return success;
}


/** @param {NS} ns */
export async function main(ns) {

  // some commands for bladeburner
  // let action = ns.bladeburner.getCurrentAction();
  // let rank = ns.bladeburner.getRank();
  // let points = ns.bladeburner.getSkillPoints();
  // let upgradeCost1 = ns.bladeburner.getSkillUpgradeCost("Blade's Intuition");
  // let upgradeCost2 = ns.bladeburner.getSkillUpgradeCost("Cloak");
  // let upgradeCost3 = ns.bladeburner.getSkillUpgradeCost("Short-Circuit");
  // let upgradeCost4 = ns.bladeburner.getSkillUpgradeCost("Digital Observer");
  // let upgradeCost5 = ns.bladeburner.getSkillUpgradeCost("Evasive System");
  // let upgradeCost6 = ns.bladeburner.getSkillUpgradeCost("Reaper");
  // let upgradeCost7 = ns.bladeburner.getSkillUpgradeCost("Hands of Midas");
  // let upgradeCost8 = ns.bladeburner.getSkillUpgradeCost("Hyperdrive");

  // SKILLS
  const bladesIntuition = "Blade's Intuition";
  const cloak = "Cloak";
  const shortCircuit = "Short-Circuit";
  const digitalObserver = "Digital Observer";
  const evasiveSystem = "Evasive System";
  const reaper = "Reaper";
  const overclock = "Overclock";
  const hyperdrive = "Hyperdrive";
  const handsOfMidas = "Hands of Midas";

  // OPERATIONS
  const assassination = "Assassination";
  const investigation = "Investigation";
  const raid = "Raid";


  // ns.bladeburner.startAction("General", "Training");
  // let success = ns.bladeburner.getActionEstimatedSuccessChance("Operations", "Investigation");
  // while (success[0] < 0.7){
  //   await ns.sleep(30000);
  //   success = ns.bladeburner.getActionEstimatedSuccessChance("Operations", "Investigation");
  // }


  let activeGroup = 'Operations';  // 'Operations', 'Contracts', 'General'
  let activeTask = 'Assassination';  // Assassination  Retirement  Sting Operation  Investigation Raid Stealth Retirement Operation Tracking Tracking
  let highPct = 0.98;
  let lowPct = 0.51;

  // const skills = [cloak, bladesIntuition, digitalObserver, hyperdrive, shortCircuit, evasiveSystem, handsOfMidas, reaper, hyperdrive];
  const skills = [overclock, hyperdrive, digitalObserver, overclock, hyperdrive, overclock, hyperdrive];
  // const skills = [bladesIntuition, cloak, evasiveSystem, reaper, hyperdrive];
  // const skills = [handsOfMidas, overclock, handsOfMidas, overclock, handsOfMidas, hyperdrive, handsOfMidas];
  // const skills = [hyperdrive, bladesIntuition, overclock, cloak, hyperdrive, shortCircuit, overclock, digitalObserver, hyperdrive, reaper, overclock, evasiveSystem, handsOfMidas];
  // const skills = ["Hyperdrive", "Digital Observer", "Overclock", "Reaper", "Hyperdrive", "Blade's Intuition", "Evasive System"];  // , "Evasive System"
  // const skills = ["Blade's Intuition", "Digital Observer", "Evasive System", "Hyperdrive", "Reaper", "Blade's Intuition", "Digital Observer", "Reaper", "Overclock"];
  // const skills = ["Hyperdrive", "Overclock", "Hyperdrive", "Digital Observer"]
  // const skills = ["Blade's Intuition","Cloak", "Reaper", "Hyperdrive", "Evasive System"];
  // const skills = ["Blade's Intuition", "Digital Observer", "Evasive System", "Reaper", "Hyperdrive"];
  // const skills = ["Digital Observer", "Evasive System", "Blade's Intuition", "Reaper", "Hyperdrive"];
  let skillIndex = 0;

  let [currentStamina, maxStamina] = ns.bladeburner.getStamina();
  while(true){
    let retCode = ns.bladeburner.startAction(activeGroup, activeTask);
    while(currentStamina > maxStamina * lowPct){
      await ns.bladeburner.nextUpdate();
      if(skillUpgrade(ns, skills[skillIndex])){
        skillIndex = (skillIndex + 1) % skills.length;
      }
      [currentStamina, maxStamina] = ns.bladeburner.getStamina();
    }
    let returnCode = ns.bladeburner.startAction("General", "Training");
    while(currentStamina < maxStamina * highPct){
      await ns.bladeburner.nextUpdate();
      if(skillUpgrade(ns, skills[skillIndex])){
        skillIndex = (skillIndex + 1) % skills.length;
      }
      [currentStamina, maxStamina] = ns.bladeburner.getStamina();
    }
    await ns.bladeburner.nextUpdate();
  }
}