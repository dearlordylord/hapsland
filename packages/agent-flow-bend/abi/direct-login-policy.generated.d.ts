/** Source-free direct stdin login decisions; native payloads and tokens remain opaque. */
export type DirectLoginPhase = "CheckingStore" | "EnteringKey" | "SavingKey" | "Done" | "Cancelled"
export type DirectLoginCommand = {readonly kind:"probe"|"input"|"save"; readonly id:number}
export declare const directLoginCommand: (model:{readonly phase:DirectLoginPhase;readonly revision:number})=>DirectLoginCommand|undefined
export declare const directLoginBindReducer: <Model extends {readonly phase:DirectLoginPhase;readonly revision:number},Action extends {readonly kind:string;readonly commandId?:number}>(facts:{readonly available:(action:Action)=>boolean},patches:Readonly<Record<"no"|"availability"|"storage",(model:Model,action:Action,phase:DirectLoginPhase)=>Model>>)=>(model:Model,event:{readonly revision:number;readonly action:Action})=>Model
