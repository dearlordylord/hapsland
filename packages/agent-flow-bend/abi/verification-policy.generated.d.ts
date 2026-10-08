/** Source-free verification ABI. Native revisions, observations and secret values stay in the host. */
export type VerificationPhase = { readonly $: "VerifyLoading" | "VerifyApproval" | "VerifyChecking" | "VerifyRecovery" | "VerifyReplacementApproval" | "VerifyEnteringKey" | "VerifySavingKey" | "VerifyDone" | "VerifyCancelled" }
export type VerificationPatch = { readonly $: "VerifyNoPatch" | "VerifyUnavailablePatch" | "VerifyLoadedPatch" | "VerifyAttemptPatch" | "VerifyObservationPatch" | "VerifyStoragePatch" }
export type VerificationPlan = { readonly $: "VerifyHold" } | { readonly $: "VerifyAdvance"; readonly phase: VerificationPhase; readonly patch: VerificationPatch }
export type VerificationAxis = "attempts" | "source" | "ready" | "result" | "yes" | "stored"
export declare const verificationMaxChecks: () => number
export declare const verificationAttemptBucket: (attempts: number) => number
export declare const verificationRouteIndex: (phase: string, action: string) => number
export declare const verificationRoutes: readonly { readonly axes: readonly { readonly name: VerificationAxis; readonly radix: number }[]; readonly plans: readonly VerificationPlan[] }[]
export declare const verificationCommandName: (phase: string) => "load" | "check" | "input" | "save" | undefined
