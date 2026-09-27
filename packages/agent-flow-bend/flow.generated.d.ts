// Interface to the JavaScript emitted from FlowRuntime.bend.
// Runtime shapes are checked by the sidecar parity runner.
export function bendInitial(): unknown;
export function bendStep(state: unknown, event: { $: string; capacity?: number },
  itemId?: { $: "None" } | { $: "Some"; value: bigint }): unknown;
export function bendChanges(before: unknown, event: { $: string; capacity?: number },
  itemId: { $: "None" } | { $: "Some"; value: bigint }, result: unknown): unknown;
