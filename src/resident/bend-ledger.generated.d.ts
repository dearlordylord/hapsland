import type { BendList } from "./bend-policy.generated.js";

export type BendLimits = {
  readonly $: "Limits";
  readonly global_items: bigint;
  readonly global_bytes: bigint;
  readonly partition_items: bigint;
  readonly partition_bytes: bigint;
};
export type BendCharge = {
  readonly $: "Charge";
  readonly id: bigint;
  readonly partition: bigint;
  readonly bytes: bigint;
};
export type BendLedger = {
  readonly $: "Ledger";
  readonly limits: BendLimits;
  readonly next_id: bigint;
  readonly charges: BendList<BendCharge>;
};
export type BendLedgerResult =
  | { readonly $: "Granted"; readonly state: BendLedger; readonly id: bigint }
  | { readonly $: "Rejected"; readonly state: BendLedger };
export type BendUsage = { readonly $: "Usage"; readonly items: bigint; readonly bytes: bigint };

export function bendLedgerInitial(limits: {
  readonly $: "Limits";
  readonly global_items: number | bigint;
  readonly global_bytes: number | bigint;
  readonly partition_items: number | bigint;
  readonly partition_bytes: number | bigint;
}): BendLedger;
export function bendLedgerReserve(state: BendLedger, partition: number | bigint,
  bytes: number | bigint): BendLedgerResult;
export function bendLedgerRelease(state: BendLedger, id: number | bigint): BendLedgerResult;
export function bendLedgerResize(state: BendLedger, id: number | bigint,
  bytes: number | bigint): BendLedgerResult;
export function bendLedgerClear(state: BendLedger): BendLedger;
export function bendLedgerTotal(state: BendLedger): BendUsage;
export function bendLedgerPartitionUsage(state: BendLedger, partition: number | bigint): BendUsage;
