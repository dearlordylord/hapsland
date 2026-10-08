/** Source-free rule conversation decisions. Native owners retain plans, metadata and writes. */
export type RulesPhase = "Scope" | "Previewing" | "Preview" | "Approval" | "Applying" | "Done" | "Cancelled"
export type RulesFact = "planMatches" | "digestMatches" | "yes" | "stale"
export type RulesPatch = "no" | "scope" | "clearPlanOutcome" | "preview" | "declined" | "stale" | "outcome" | "clearPlan"
export type RulesNativeCommand<Action extends string,Scope extends string,Plan> = {readonly kind:"preview";readonly id:number;readonly action:Action;readonly scope:Scope} | {readonly kind:"apply";readonly id:number;readonly plan:Plan}
export declare const rulesNativeCommand:<Action extends string,Scope extends string,Plan extends object>(model:{readonly phase:RulesPhase;readonly revision:number;readonly action:Action;readonly scope?:Scope|undefined;readonly plan?:Plan|undefined})=>RulesNativeCommand<Action,Scope,Plan>|undefined
export declare const rulesBindReducer:<Model extends {readonly phase:RulesPhase},Action extends {readonly kind:string}>(current:(model:Model,event:{readonly revision:number;readonly action:Action})=>boolean,facts:Readonly<Record<RulesFact,(model:Model,action:Action)=>boolean>>,apply:Readonly<Record<RulesPatch,(model:Model,action:Action,phase:RulesPhase)=>Model>>)=>(model:Model,event:{readonly revision:number;readonly action:Action})=>Model
