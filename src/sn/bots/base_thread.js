export async function threadLoop(ns, label, target, period, fn, fnTime, verbose=false){
  let prevDate = undefined;
  let cumPeriod = 0
  let cumDelta = 0
  while (true){
    const estTime = fnTime(target);
    let date = new Date(Date.now());
    let empiricalPeriod = date - prevDate;
    if(isNaN(empiricalPeriod)){
      empiricalPeriod = period;
    } else {
      cumPeriod += empiricalPeriod;
    }
    prevDate = date;
    let delta = empiricalPeriod - period;
    let sleepTime = period - estTime - delta * 0.75 - cumDelta * 0.75;
    cumDelta += delta;
    if(verbose){
      ns.tprintf("%s | %s Duration: %s ms, period: %s ms, cumulative: %s, cumDelta: %s", date.toISOString(), label, 
          ns.formatNumber(estTime, 5, 1e10), empiricalPeriod, cumPeriod, cumDelta);
    }
    await ns.sleep(sleepTime);
    await fn(target);
  }
}