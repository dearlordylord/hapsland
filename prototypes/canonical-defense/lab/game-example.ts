import { runGameExperiment, type GameExperiment, type GamePlan } from "./game.ts"

type GameResult = ReturnType<typeof runGameExperiment>
/** Incoming callbacks and established outcomes are different observations. */
function containsTag(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some(child=>containsTag(child,name))
  if (value === null || typeof value !== "object") return false
  const object=value as Record<string,unknown>
  return (typeof object.$ === "string" && object.$.endsWith(name)) || Object.values(object).some(child=>containsTag(child,name))
}
function events(result: GameResult, name: string, established?: string) {
  const found: {time:number;event:Record<string,unknown>;outputs:unknown;rejection:unknown}[]=[]
  function visit(value:unknown) {
    if(Array.isArray(value)){for(const child of value)visit(child);return}
    if(value===null||typeof value!=="object")return
    const object=value as Record<string,unknown>
    if(typeof object.$==="string"&&object.$.endsWith("ProductFrame")){
      const event=object.event as Record<string,unknown>
      if(typeof event.$==="string"&&event.$.endsWith(name)&&(!established||containsTag(object.outputs,established)))
        found.push({time:object.time as number,event,outputs:object.outputs,rejection:object.rejection})
      return
    }
    for(const child of Object.values(object))visit(child)
  }
  visit(result.trace)
  return found
}
export function summarizeGameResult(result: GameResult) {
  const settle = events(result, "ReviewServiceRequestSettled", "ReviewServiceRequestOutcomeRecorded")
  const output = events(result, "SubmissionTerminal", "SubmissionRecorded")
  const finish = events(result, "FinishTerminal", "FinishRecorded")
  return {
    physicalCallbacks: {
      settlements:events(result,"ReviewServiceRequestSettled"),submissions:events(result,"SubmissionTerminal"),finishes:events(result,"FinishTerminal")
    },
    game: result.game, termination: result.termination, businessTime: result.business.now,
    shots: result.actions.filter(a => a.automatic).map(a => ({tick:a.action.atTick,target:a.target})),
    refusals: result.actions.filter(a => a.result !== "Applied"),
    settlements: settle.map(e => ({time:e.time,partition:e.event.partition,lifetime:e.event.lifetime,round:e.event.round,operation:e.event.operation,outcome:e.event.outcome})),
    submissions: output.map(e => ({time:e.time,event:e.event})),
    finishes: finish.map(e => ({time:e.time,event:e.event})),
    lastSettlement: settle.length ? Math.max(...settle.map(e => e.time)) : null,
    lastSubmission: output.length ? Math.max(...output.map(e => e.time)) : null,
    retainedEntries: result.business.projection.pendingFindings.length,
    ledgerByteTicks: result.observations.slice(1).reduce((n,o)=>n+o.business.projection.global.bytes,0),
    peakLedgerBytes: Math.max(...result.observations.map(o=>o.business.projection.global.bytes)),
    recordingIdentity: result.recording.traceIdentity,
    configurationIdentity: result.recording.configurationIdentity
  }
}

/** Plans are fixed before observing results; investments are charged by actual Host. */
export function teachingPlans(layout: 0 | 1 | 2): readonly GamePlan[] {
  const positions = [
    {a:[652,215],second:[652,135],c:[56,424],secondC:[56,472],prep:[584,152]},
    {a:[360,456],second:[360,536],c:[88,552],secondC:[88,600],prep:[392,152]},
    {a:[216,520],second:[216,568],c:[72,344],secondC:[72,392],prep:[600,280]}
  ][layout]!
  const build=(tower:string,point:number[])=>({atTick:0,kind:"build" as const,tower,x:point[0]!,y:point[1]!})
  const a=build("workAccelerator",positions.a),c=build("resultCourier",positions.c)
  const upgrade={atTick:0,kind:"upgrade" as const,index:1}
  return [
    {name:"none",actions:[]}, {name:"accelerator",actions:[a]}, {name:"courier",actions:[c]},
    {name:"mixed",actions:[a,c]}, {name:"accelerator-upgrade",actions:[a,upgrade]},
    {name:"two-accelerators",actions:[a,build("workAccelerator",positions.second)]},
    {name:"courier-upgrade",actions:[c,upgrade]},
    {name:"two-couriers",actions:[c,build("resultCourier",positions.secondC)]},
    {name:"preparation",actions:[build("workAccelerator",positions.prep)]}
  ]
}
export const teachingContexts: readonly {
  name:string; role:"tuning"|"heldOut"; layout:0|1|2; seed:number;
  settings:NonNullable<GameExperiment["settings"]>; ticks:number
}[] = [
  {name:"slow-review",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:3200,outputDelayMs:80,sourceDelayMs:0,burst:4},ticks:200},
  {name:"slow-output",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:100,outputDelayMs:2400,sourceDelayMs:0,burst:4},ticks:200},
  {name:"slow-preparation",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:100,outputDelayMs:80,sourceDelayMs:1200,burst:4},ticks:200},
  {name:"clear",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:3200,outputDelayMs:80,sourceDelayMs:0,burst:7,outcome:"clear"},ticks:200},
  {name:"quick-sparse",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:40,outputDelayMs:40,sourceDelayMs:0,burst:1},ticks:20},
  {name:"unreadable-source",role:"tuning",layout:0,seed:152,settings:{sourceReadable:false,burst:4},ticks:200},
  {name:"stop-cutoff",role:"tuning",layout:0,seed:152,settings:{jevDelayMs:1200,outputDelayMs:80,sourceDelayMs:0,burst:1,finishAtMs:500},ticks:90},
  {name:"held-out-campus",role:"heldOut",layout:1,seed:837,settings:{jevDelayMs:1800,outputDelayMs:1200,sourceDelayMs:300,burst:3},ticks:200},
  {name:"held-out-junction",role:"heldOut",layout:2,seed:991,settings:{jevDelayMs:2200,outputDelayMs:600,sourceDelayMs:0,burst:6,outcome:"clear"},ticks:200}
]

export function runTeachingCase(context:typeof teachingContexts[number],plan:GamePlan) {
  const result=runGameExperiment({context:context.name,scenario:"continuousGame",seed:context.seed,layout:context.layout,
    budget:160,enabled:["workAccelerator","resultCourier"],automaticTowers:true,
    settings:{outcome:"finding",arrivalIntervalMs:60000,...context.settings},
    actions:plan.actions,untilTicks:context.ticks,maxEvents:2000})
  return {context:context.name,role:context.role,plan:plan.name,metrics:summarizeGameResult(result)}
}
/** Advisory candidates: existing horizons have not qualified the restored physical journeys. */
export function runGameExampleStudy() {
  return teachingContexts.flatMap(context=>teachingPlans(context.layout).map(plan=>runTeachingCase(context,plan)))
}
export function summarizeGameExampleStudy(study:ReturnType<typeof runGameExampleStudy>) { return study }
export function checkGameExampleStudy(study:ReturnType<typeof runGameExampleStudy>) {
  const failures:string[]=[]
  for(const row of study) {
    if(row.metrics.refusals.length) failures.push(`${row.context}/${row.plan}: refused authored construction`)
    if(row.metrics.termination==="eventLimit") failures.push(`${row.context}/${row.plan}: exhausted event budget`)
    if(row.metrics.game.spent+row.metrics.game.remainingBudget!==160) failures.push(`${row.context}/${row.plan}: investment accounting`)
  }
  const expected = new Set(teachingContexts.flatMap(context =>
    teachingPlans(context.layout).map(plan => `${context.name}/${plan.name}`)))
  const seen = new Set<string>()
  for (const row of study) {
    const key = `${row.context}/${row.plan}`
    if (!expected.has(key)) failures.push(`${key}: undeclared study row`)
    if (seen.has(key)) failures.push(`${key}: duplicate study row`)
    seen.add(key)
    if (row.context === "stop-cutoff" && (row.metrics.shots.length || row.metrics.settlements.length ||
      row.metrics.physicalCallbacks.settlements.length || row.metrics.finishes.length))
      failures.push(`${key}: the declared early Stop horizon precedes physical review and delivery`)
  }
  for (const key of expected) if (!seen.has(key)) failures.push(`${key}: missing study row`)
  const find=(context:string,plan:string)=>study.find(r=>r.context===context&&r.plan===plan)?.metrics
  const clear=find("clear","courier"),none=find("clear","none")
  if(clear&&none&&(clear.shots.length!==0||clear.ledgerByteTicks!==none.ledgerByteTicks)) failures.push("Clear courier should be a dead investment")
  for(const row of study) {
    const shots=row.metrics.shots.filter(s=>s.target?.effect.kind==="reviewServiceRequestSettled")
    for(const shot of shots) {
      const owner=shot.target!.owner
      const accepted=row.metrics.settlements.find(e=>e.partition===owner.partition&&e.lifetime===owner.lifetime&&e.round===owner.round&&e.operation===owner.operation)
      if(accepted && accepted.time<shot.tick*20+100) failures.push(`${row.context}/${row.plan}: accepted shot violates elapsed time`)
    }
  }
  if(failures.length) throw new Error(failures.join("\n"))
  return {cases:study.length,passed:true,educationalQualification:"unqualified" as const,
    reason:"The unchanged 20–200 tick candidate horizons do not establish complete physical tower benefits or held-out balance. Partial Stop and useful deliveries are qualified separately in game-balance-lab.test.mts.",
    scope:"complete declared matrix, authored placement, finite budget, accounting, Clear, early Stop without delivery, and shot chronology"}
}

/** Counterexample: rapid recurring Stop occurs before any result reaches the courier. */
export function runRecurringCourierCase(planName: "none" | "courier") {
  const context: typeof teachingContexts[number] = {
    name: "premature-recurring-stop", role: "tuning", layout: 0, seed: 152, ticks: 40,
    settings: {jevDelayMs: 100, outputDelayMs: 2400, sourceDelayMs: 0, burst: 1,
      arrivalIntervalMs: 120, outcome: "finding"}
  }
  return runTeachingCase(context, teachingPlans(0).find(plan => plan.name === planName)!)
}
