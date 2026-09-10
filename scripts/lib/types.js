
/** Condition
 * @typedef {{kind:"threshold", path:string, op:"<="|">="|"<"|">", value:number}} Threshold
 * @typedef {{kind:"equals", path:string, value:number|string|boolean}} Equals
 * @typedef {{kind:"and", path:string, children:[Condition]}} And
 * @typedef {{kind:"or", path:string, children:[Condition]}} Or
 * @typedef {{kind:"not", path:string, child:Condition}} Not
 * @typedef {Threshold|Equals|Predicate|And|Or|Not} Condition 
 * */

/** Goal
 * Note: The role in the Goal is "installHorizon" if that goal is what is bounding when the install can happen
 * @typedef {{id: string, source: string, enabled: boolean, survivesInstall: boolean, role?:string, 
 *            condition: Condition, deadline?:num, preconditions: [string]}} Goal
 */

/** GoalSet
 * @typedef {{schema: int, revision: int, epoch: int, goals: [Goal]}} GoalSet
 */

/**
 * Constraints
 * @typedef {Record<string, string|number|boolean>} Match
 * @typedef {"absolute"|"fractional"} UnitType
 * @typedef {{id:string, kind:string, resource:string, value:num, unit:UnitType, against?:string}} Reserve
 * @typedef {{id:string, kind:string, action:string, match:Match}} Forbid
 * @typedef {{id:string, kind:string, match:Match, maxPaybackSec:num}} Admit
 * @typedef {{id:string, kind:string, controller:string}} Disable
 * @typedef {{Reserve|Forbid|Admit|Disable}} Constraint
 * @typedef {{schema:int, revision:int, constraints:[Constraint]}} ConstraintSet
 */

/**
 * Preferences - do later or skip
 */

/**
 * Control
 * @typedef {"auto"|"ask"|"block"} DialType
 * @typedef {"user"|"cli"} WhoAnswered
 * @typedef {{choice:string, at:num, by:WhoAnswered}} Answer
 * @typedef {{advisoryMode:boolean, paused:boolean, pausedAt:num, pauseExpiresAt?:num}} ControllerSwitch
 * @typedef {{dial:DialType, timeoutSec?:num}} EscalationPoint
 * @typedef {{defaultDial:DialType, defaultTimeoutSec:num, points:{Record<string, EscalationPoint>}}} EscalationSet
 * @typedef {{schema:int, revision:int, advisoryMode:boolean, controllers:{Record<string, ControllerSwitch>}, escalations:EscalationSet, answers:{Record<string:Answer>}}} ControlSet
 */