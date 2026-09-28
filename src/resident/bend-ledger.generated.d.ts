import type { BendList } from "./bend-policy.generated.js";

export type BendLimits = {
  readonly $: "Ledger.Limits";
  readonly global_items: number;
  readonly global_bytes: number;
  readonly partition_items: number;
  readonly partition_bytes: number;
};
export type BendCharge = {
  readonly $: "Ledger.Charge";
  readonly id: number;
  readonly partition: number;
  readonly bytes: number;
};
export type BendLedger = {
  readonly $: "Ledger.Ledger";
  readonly limits: BendLimits;
  readonly next_id: number;
  readonly charges: BendList<BendCharge>;
};
export type BendLedgerResult =
  | { readonly $: "Ledger.Granted"; readonly state: BendLedger; readonly id: number }
  | { readonly $: "Ledger.Rejected"; readonly state: BendLedger };
export type BendUsage = { readonly $: "Ledger.Usage"; readonly items: number; readonly bytes: number };

export function bendLedgerInitial(limits: {
  readonly $: "Ledger.Limits";
  readonly global_items: number;
  readonly global_bytes: number;
  readonly partition_items: number;
  readonly partition_bytes: number;
}): BendLedger;
export function bendLedgerReserve(state: BendLedger, partition: number,
  bytes: number): BendLedgerResult;
export function bendLedgerRelease(state: BendLedger, id: number): BendLedgerResult;
export function bendLedgerResize(state: BendLedger, id: number,
  bytes: number): BendLedgerResult;
export function bendLedgerClear(state: BendLedger): BendLedger;
export function bendLedgerTotal(state: BendLedger): BendUsage;
export function bendLedgerPartitionUsage(state: BendLedger, partition: number): BendUsage;
