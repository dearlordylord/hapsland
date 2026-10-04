export declare const WORKLOAD_CONFORMANCE_TIMEOUT_MS: 100000;
export function runWorkloadNative(fixture: URL, options?: { readonly emissionTimeoutMs?: number; readonly clangTimeoutMs?: number; readonly executionTimeoutMs?: number }): unknown;
export function runWorkloadEmitted(fixture: URL, options?: { emissionTimeoutMs?: number }): unknown;
