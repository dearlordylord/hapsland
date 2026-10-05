import type { RunRuntimeSnapshot, RunStructuralFrame } from "../../packages/monkey-business/src/index.ts"

export function compareCanonicalOwner(value: unknown, original: unknown, field: string): void
export function compareNativeRuntime(value: unknown, original: RunRuntimeSnapshot, field: string): void
export function compareNativeFrames(values: unknown, publicFrames: readonly RunStructuralFrame[], field: string): void
