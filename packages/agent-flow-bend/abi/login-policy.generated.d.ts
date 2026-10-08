/** Source-free login navigation ABI. Native payloads and tokens stay in the host. */
export type LoginPhase = { readonly $: "LoginSelectingDestination" | "LoginPreparingTarget" | "LoginEnteringKey" | "LoginConfirmingSave" | "LoginSavingKey" | "LoginCheckingActive" | "LoginDone" | "LoginCancelled" }
export type LoginPatch = { readonly $: "LoginNoPatch" | "LoginDestinationPatch" | "LoginProposalPatch" | "LoginStoragePatch" | "LoginActivePatch" }
export type LoginPlan = { readonly $: "LoginHold" | "LoginReset" } | { readonly $: "LoginAdvance"; readonly phase: LoginPhase; readonly patch: LoginPatch }
export declare const loginRouteIndex: (phase: string, action: string) => number
export declare const loginRoutePlans: readonly (readonly LoginPlan[])[]
export declare const loginCommandName: (phase: string) => "choose" | "prepare" | "input" | "confirm" | "save" | "active" | undefined
