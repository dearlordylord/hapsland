/** Source-free setup decisions. Native payloads, digests and numeric tokens remain opaque. */
export type SetupPhase="Previewing"|"HookApproval"|"RulesApproval"|"Applying"|"Activating"|"Verifying"|"Diagnosing"|"Done"|"Cancelled"|"Back"|"Failed"
export type SetupFact="compatOk"|"proceed"|"written"|"pending"|"installDigest"|"installPresent"|"rulesDigest"|"digestMatch"|"yes"|"ready"|"cancelled"|"partial"|"sequenceNext"|"succeeded"
export type SetupPatch="no"|"preview"|"append"|"freshProposal"|"installApproval"|"rulesApproval"|"clearApprovals"|"activated"|"verification"|"diagnosis"|"failedActivation"
export declare const setupNativeCommand:(model:{readonly phase:SetupPhase;readonly revision:number})=>{readonly kind:"preview"|"apply"|"activate"|"verify"|"diagnose";readonly id:number}|undefined
export declare const setupBindReducer:<Model extends {readonly phase:SetupPhase;readonly revision:number},Action extends {readonly kind:string;readonly commandId?:number}>(facts:Readonly<Record<SetupFact,(model:Model,action:Action)=>boolean>>,apply:Readonly<Record<SetupPatch,(model:Model,action:Action,phase:SetupPhase,exit:number|undefined)=>Model>>&{readonly progress:(model:Model,action:Action)=>Model})=>(model:Model,event:{readonly revision:number;readonly action:Action})=>Model
export declare const setupInstallationCanProceed:(status:string|undefined)=>boolean
export declare const setupInstallationWasWritten:(status:string|undefined)=>boolean
export declare const setupReadiness:<Observation>(readStage:(observation:Observation,stage:"installation"|"credential"|"repository"|"rules")=>string|undefined,observation:Observation)=>boolean
