export type HarnessKind = 'unit' | 'process' | 'bounded-scenario';
export const UNIT_TEST_TIMEOUT_MS: number;
export const PROCESS_TEST_TIMEOUT_MS: number;
export const DEFAULT_CHILD_TIMEOUT_MS: number;
export const FIXTURE_READY_TIMEOUT_MS: number;
export const CLEANUP_TIMEOUT_MS: number;
export const boundedScenarioFiles: ReadonlyMap<string, string>;
export function timeoutForKind(kind: HarnessKind): number;
