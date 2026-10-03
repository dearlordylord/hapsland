import type { Observation } from "../../monkey-business/src/index.ts";
export function publicRows(observations: readonly Observation[]): number[][];
export function nativeRows(rows: readonly number[][]): number[][];
