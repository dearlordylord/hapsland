/** Review-input identifiers and evidence needs for the current rule-pack schema. */
export const TYPE_INPUT_CONTRACT = "direct-event/type-shape/v1" as const;
export const FUNCTION_INPUT_CONTRACT = "direct-event/function/v1" as const;

export const TYPE_CAPABILITIES = ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"] as const;
export const FUNCTION_CAPABILITIES = ["signature", "body", "resolved-local-calls", "resolved-outbound-types"] as const;

export type Capability = typeof TYPE_CAPABILITIES[number] | typeof FUNCTION_CAPABILITIES[number];
export type ReviewTarget =
  | { readonly artifactKind: "typeShape"; readonly inputContract: typeof TYPE_INPUT_CONTRACT;
    readonly capabilities: ReadonlyArray<typeof TYPE_CAPABILITIES[number]> }
  | { readonly artifactKind: "function"; readonly inputContract: typeof FUNCTION_INPUT_CONTRACT;
    readonly capabilities: ReadonlyArray<typeof FUNCTION_CAPABILITIES[number]> };
