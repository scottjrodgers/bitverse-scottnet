# Bitburner Scottnet Multi-Daemon Network Communication

## HGW Daemon
- prepServer(targetServer, memLimit)
- attackServer(targetServer, memLimit)
- autoHackXP(memLimit)
- autoHackCash(memLimit)
- memoryReport() -> amount of memory committed
- nukem()
  - Nukes all the serers that can be nuked with the current hack tools.


## Hack Tools Daemon
- minCashThreshold($$)
  - update the limit below which this daemon will not spend cash.  Purchases must keep the savings level above this threshold.
- setBudget($/sec)
  - Sets the spending budget to a new rate of dollars / second.  A savings record will be incremented at this rate, and when enough has been allocated to make the purchase, assuming there is actually enough in savings, it purchases the next tool.
  - messages HGW to nukem after a new tool is purchased


## Bladeburner Daemon
- statsPriority(p)
  - Sets priority for building up combat stats (STR, DEF, DEX, AGI)
- combatPriority(p)
  - Sets a priority for acquiring bladeburner combat skills
- growthPriority(p)
  - Sets a priority for acquiring bladeburner growth skills
- growthFocus()
  - Focus on growth of stats and skills
- cashflowFocus()
  - Focus on generating cashflow


## Compute Daemon
- savingsThreshold($)
- setBudget($/sec)
- setRamTarget(n)
- setCoresTarget(n)
- externalServers(true/false)
- growHome(true/false)
- status() -> (status message)


## Hacknet Daemon
- growFast(degree)
- growSmart(degree)
- growAuto()
- setBudget($ / sec)
- minCashThreshold($$)
- pauseGrowth()
- setHashPriority( type-of-spend, relative priority)
  - Perhaps spending on cash has a default priority of 100.
- status() -> (status message)


## Gangs Daemon
- enableEquipmentPurchases()
- setEquipmentBudget($/sec)
- setSavingsThreshold($)
  - minimum cash in savings to make purchases
- growRep(priority)
- growCash(priority)
- setAscendMulitplier(n)
  - for when to do auto ascend
- setMaxMultiplier(n, exception)
  - to stop auto ascending
  - unless multiplier grows more than (exception)
- setMultiplierForTerritoryWarfare
- status() -> (status message)


## Monitoring / Logging
- reportPurchase(purchaseType, $amount)
- reportIncomeEstimate(incomeType, $amount)
- requestTrendsReport()
  - Could be income/expenses
  - Could be tracking to budgets
  - Could be ...
- requestServerStatus()


