import type { runWorkloadNative } from "./workload-native-runner.mjs"
export function runFreshnessNative(fixture: URL, options?: Parameters<typeof runWorkloadNative>[1]): number[][]
export function runFreshnessEmitted(fixture: URL): number[][]
