/** Source-free credential planning ABI. Paths and secret values stay native. */
export type CredentialSource = { readonly $: "Environment" | "ProjectLocal" | "Project" | "User" | "Native" }
export type CredentialSources = { readonly $: "Nil" } | { readonly $: "Con"; readonly head: CredentialSource; readonly tail: CredentialSources }
export declare const lookupSources: (explicit: boolean, captured: boolean, root: boolean, local: boolean, project: boolean) => CredentialSources
export declare const saveAvailable: (destination: CredentialSource, local: boolean) => boolean
