import type { RawCanonicalEvent } from "./raw-canonical-event.d.ts";
export type * from "./raw-canonical-event.d.ts";
export declare const bendCanonicalInitial: (limits: unknown) => unknown;
export declare const bendCanonicalStep: (state: unknown, event: RawCanonicalEvent) => unknown;
export declare const bendCanonicalTotal: (state: unknown) => unknown;
export declare const bendCanonicalPartitionUsage: (state: unknown, partition: number) => unknown;
export declare const bendCanonicalInventory: (state: unknown) => unknown;
export declare const bendPreparationLimit: () => unknown;
export declare const bendJevRequestLimit: () => unknown;
