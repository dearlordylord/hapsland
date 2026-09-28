import { bendCanonicalInitial, bendCanonicalStep } from "./canonical.generated.js";

const MAX_NAT = 2 ** 48 - 1;
const MAX_BYTES = 2 ** 47 - 1;
const MAX_UNITS = 16;
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid canonical object");
  return value as RecordValue;
};
const tag = (value: unknown): string => {
  const name = object(value).$;
  if (typeof name !== "string") throw new TypeError("missing canonical constructor");
  return name;
};
const nat = (value: unknown, positive = false): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value > MAX_NAT ||
      value < (positive ? 1 : 0)) throw new TypeError("invalid canonical Nat");
  return value;
};
const bytes = (value: unknown): number => {
  const amount = nat(value, true);
  if (amount > MAX_BYTES) throw new TypeError("canonical byte count exceeds safe sum bound");
  return amount;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError("invalid canonical Bool");
  return value;
};
const fields = (value: unknown, expectedTag: string, names: readonly string[]): RecordValue => {
  const item = object(value);
  if (tag(item) !== expectedTag || Object.keys(item).sort().join() !== ["$", ...names].sort().join()) {
    throw new TypeError(`invalid ${expectedTag} constructor`);
  }
  return item;
};
const inputFields = (value: unknown, names: readonly string[]): void => {
  if (Object.keys(object(value)).sort().join() !== names.slice().sort().join()) {
    throw new TypeError("invalid canonical event fields");
  }
};
const list = (values: readonly number[]): unknown => {
  if (!Array.isArray(values) || values.length > MAX_UNITS) throw new TypeError("too many units");
  return values.reduceRight<unknown>((tail, value) => ({ $: "Con", head: bytes(value), tail }), { $: "Nil" });
};
const readList = <T>(value: unknown, decode: (item: unknown) => T, limit = 256): T[] => {
  const result: T[] = [];
  let cursor = value;
  while (tag(cursor) === "Con") {
    if (result.length >= limit) throw new TypeError("canonical list exceeded bound");
    const cell = fields(cursor, "Con", ["head", "tail"]);
    result.push(decode(cell.head));
    cursor = cell.tail;
  }
  fields(cursor, "Nil", []);
  return result;
};

export type CanonicalEvent =
  | { readonly kind: "openRound"; readonly partition: number; readonly lifetime: number }
  | { readonly kind: "beginPreparation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly bytes: number }
  | { readonly kind: "preparationCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly unitBytes: readonly number[] }
  | { readonly kind: "reviewCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "finding" | "clear" | "unavailable" }
  | { readonly kind: "stopPolled"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly deadline: boolean }
  | { readonly kind: "outputStarted"; readonly partition: number; readonly lifetime: number; readonly round: number }
  | { readonly kind: "outputTerminal"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "retirePartition"; readonly partition: number; readonly lifetime: number; readonly round: number };

export type CanonicalCommand =
  | { readonly kind: "roundStarted"; readonly id: number }
  | { readonly kind: "prepare"; readonly operation: number; readonly reservation: number }
  | { readonly kind: "preparationRefused" }
  | { readonly kind: "unitAdmitted"; readonly operation: number; readonly reservation: number }
  | { readonly kind: "unitRefused" }
  | { readonly kind: "reservationReleased"; readonly id: number }
  | { readonly kind: "reviewRecorded"; readonly outcome: "finding" | "clear" | "unavailable" }
  | { readonly kind: "waitForWork" }
  | { readonly kind: "cancelWork"; readonly operation: number }
  | { readonly kind: "finishReady" }
  | { readonly kind: "writeAuthorized"; readonly operation: number }
  | { readonly kind: "writeRecorded"; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "waitForOutput" }
  | { readonly kind: "reofferAtStop" }
  | { readonly kind: "partitionRetired"; readonly round: number };

const identity = (event: CanonicalEvent) => ({ partition: nat(event.partition, true), lifetime: nat(event.lifetime, true) });
const encode = (event: CanonicalEvent): unknown => {
  const ids = identity(event);
  switch (event.kind) {
    case "openRound": inputFields(event, ["kind", "partition", "lifetime"]); return { $: "Canonical.OpenRound", ...ids };
    case "beginPreparation": inputFields(event, ["kind", "partition", "lifetime", "round", "bytes"]); return { $: "Canonical.BeginPreparation", ...ids, round: nat(event.round, true), bytes: bytes(event.bytes) };
    case "preparationCompleted": inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "unitBytes"]); return { $: "Canonical.PreparationCompleted", ...ids, round: nat(event.round, true), operation: nat(event.operation, true), unit_bytes: list(event.unitBytes) };
    case "reviewCompleted": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { finding: "Canonical.Finding", clear: "Canonical.Clear", unavailable: "Canonical.Unavailable" }[event.outcome];
      if (!outcome) throw new TypeError("invalid review outcome");
      return { $: "Canonical.ReviewCompleted", ...ids, round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "stopPolled": inputFields(event, ["kind", "partition", "lifetime", "round", "deadline"]); return { $: "Canonical.StopPolled", ...ids, round: nat(event.round, true), deadline: bool(event.deadline) };
    case "outputStarted": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.OutputStarted", ...ids, round: nat(event.round, true) };
    case "outputTerminal": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      if (!outcome) throw new TypeError("invalid write outcome");
      return { $: "Canonical.OutputTerminal", ...ids, round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "retirePartition": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.RetirePartition", ...ids, round: nat(event.round, true) };
    default: throw new TypeError("unknown canonical event");
  }
};
const outcome = (value: unknown): "finding" | "clear" | "unavailable" => {
  const name = tag(value);
  if (name === "Canonical.Finding") return "finding";
  if (name === "Canonical.Clear") return "clear";
  if (name === "Canonical.Unavailable") return "unavailable";
  throw new TypeError("unknown canonical outcome");
};
const writeOutcome = (value: unknown): "acknowledged" | "failed" | "unknown" => {
  const name = tag(value);
  if (name === "Canonical.Acknowledged") return "acknowledged";
  if (name === "Canonical.Failed") return "failed";
  if (name === "Canonical.Unknown") return "unknown";
  throw new TypeError("unknown write outcome");
};
const decodeCommand = (value: unknown): CanonicalCommand => {
  switch (tag(value)) {
    case "Canonical.RoundStarted": return { kind: "roundStarted", id: nat(fields(value, "Canonical.RoundStarted", ["id"]).id, true) };
    case "Canonical.Prepare": { const x = fields(value, "Canonical.Prepare", ["operation", "reservation"]); return { kind: "prepare", operation: nat(x.operation, true), reservation: nat(x.reservation, true) }; }
    case "Canonical.PreparationRefused": fields(value, "Canonical.PreparationRefused", []); return { kind: "preparationRefused" };
    case "Canonical.UnitAdmitted": { const x = fields(value, "Canonical.UnitAdmitted", ["operation", "reservation"]); return { kind: "unitAdmitted", operation: nat(x.operation, true), reservation: nat(x.reservation, true) }; }
    case "Canonical.UnitRefused": fields(value, "Canonical.UnitRefused", []); return { kind: "unitRefused" };
    case "Canonical.ReservationReleased": return { kind: "reservationReleased", id: nat(fields(value, "Canonical.ReservationReleased", ["id"]).id, true) };
    case "Canonical.ReviewRecorded": return { kind: "reviewRecorded", outcome: outcome(fields(value, "Canonical.ReviewRecorded", ["outcome"]).outcome) };
    case "Canonical.WaitForWork": fields(value, "Canonical.WaitForWork", []); return { kind: "waitForWork" };
    case "Canonical.CancelWork": return { kind: "cancelWork", operation: nat(fields(value, "Canonical.CancelWork", ["operation"]).operation, true) };
    case "Canonical.FinishReady": fields(value, "Canonical.FinishReady", []); return { kind: "finishReady" };
    case "Canonical.WriteAuthorized": return { kind: "writeAuthorized", operation: nat(fields(value, "Canonical.WriteAuthorized", ["operation"]).operation, true) };
    case "Canonical.WriteRecorded": return { kind: "writeRecorded", outcome: writeOutcome(fields(value, "Canonical.WriteRecorded", ["outcome"]).outcome) };
    case "Canonical.WaitForOutput": fields(value, "Canonical.WaitForOutput", []); return { kind: "waitForOutput" };
    case "Canonical.ReofferAtStop": fields(value, "Canonical.ReofferAtStop", []); return { kind: "reofferAtStop" };
    case "Canonical.PartitionRetired": return { kind: "partitionRetired", round: nat(fields(value, "Canonical.PartitionRetired", ["round"]).round, true) };
    default: throw new TypeError("unknown canonical command");
  }
};

export type CanonicalProjection = {
  readonly global: { readonly items: number; readonly bytes: number };
  readonly rounds: readonly { readonly partition: number; readonly lifetime: number; readonly id: number; readonly waiting: boolean; readonly deciding: boolean; readonly write?: number; readonly uncertain: boolean }[];
  readonly work: readonly { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly reservation: number; readonly kind: "preparing" | "reviewing" }[];
};
const known = new WeakSet<object>();
export const projectCanonical = (state: unknown): CanonicalProjection => {
  if (!known.has(object(state))) throw new TypeError("foreign canonical state");
  const s = fields(state, "Canonical.State", ["ledger", "rounds", "work", "next_round", "next_operation"]);
  nat(s.next_round, true); nat(s.next_operation, true);
  const ledger = fields(s.ledger, "Ledger.Ledger", ["limits", "next_id", "charges"]);
  nat(ledger.next_id, true);
  const limits = fields(ledger.limits, "Ledger.Limits", ["global_items", "global_bytes", "partition_items", "partition_bytes"]);
  for (const value of Object.values(limits).slice(1)) nat(value, true);
  const charges = readList(ledger.charges, (value) => {
    const x = fields(value, "Ledger.Charge", ["id", "partition", "bytes"]);
    return { id: nat(x.id, true), partition: nat(x.partition, true), bytes: nat(x.bytes) };
  });
  const rounds = readList(s.rounds, (value) => {
    const x = fields(value, "Canonical.Round", ["partition", "lifetime", "id", "waiting", "deciding", "write", "uncertain"]);
    const write = tag(x.write) === "Some" ? nat(fields(x.write, "Some", ["value"]).value, true) : undefined;
    if (write === undefined) fields(x.write, "None", []);
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), id: nat(x.id, true), waiting: bool(x.waiting), deciding: bool(x.deciding), ...(write === undefined ? {} : { write }), uncertain: bool(x.uncertain) };
  });
  const work = readList(s.work, (value) => {
    const x = fields(value, "Canonical.Work", ["partition", "lifetime", "round", "operation", "charge", "kind"]);
    const kind = tag(x.kind);
    if (kind !== "Canonical.Preparing" && kind !== "Canonical.Reviewing") throw new TypeError("invalid work kind");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true), operation: nat(x.operation, true), reservation: nat(x.charge, true), kind: kind === "Canonical.Preparing" ? "preparing" as const : "reviewing" as const };
  });
  const chargeIds = new Set(charges.map((x) => x.id));
  const chargesById = new Map(charges.map((x) => [x.id, x]));
  const usedBytes = charges.reduce((sum, x) => sum + x.bytes, 0);
  if (chargeIds.size !== charges.length || charges.length !== work.length ||
      new Set(work.map((x) => x.operation)).size !== work.length ||
      new Set(work.map((x) => x.reservation)).size !== work.length ||
      new Set(rounds.map((x) => x.partition)).size !== rounds.length ||
      rounds.some((x) => x.id >= (s.next_round as number) || (x.write !== undefined && x.write >= (s.next_operation as number))) ||
      work.some((x) => chargesById.get(x.reservation)?.partition !== x.partition ||
        x.operation >= (s.next_operation as number) ||
        !rounds.some((round) => round.partition === x.partition && round.lifetime === x.lifetime && round.id === x.round)) ||
      charges.some((x) => x.id >= (ledger.next_id as number)) ||
      rounds.some((round) => {
        const local = charges.filter((charge) => charge.partition === round.partition);
        return local.length > (limits.partition_items as number) ||
          local.reduce((sum, charge) => sum + charge.bytes, 0) > (limits.partition_bytes as number);
      }) ||
      charges.length > (limits.global_items as number) || usedBytes > (limits.global_bytes as number)) {
    throw new TypeError("inconsistent canonical state");
  }
  return { global: { items: charges.length, bytes: usedBytes }, rounds, work };
};
export const initialCanonical = (limits: { readonly globalItems: number; readonly globalBytes: number; readonly partitionItems: number; readonly partitionBytes: number }): unknown => {
  const values = Object.values(limits);
  if (values.length !== 4 || values.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > MAX_NAT) ||
      limits.globalItems > 256 || limits.partitionItems > 16 ||
      limits.globalBytes > MAX_BYTES || limits.partitionBytes > MAX_BYTES) throw new TypeError("invalid canonical limits");
  const state = bendCanonicalInitial({ $: "Ledger.Limits", global_items: limits.globalItems, global_bytes: limits.globalBytes, partition_items: limits.partitionItems, partition_bytes: limits.partitionBytes });
  known.add(object(state)); projectCanonical(state);
  return state;
};
export const stepCanonical = (state: unknown, event: CanonicalEvent): { readonly state: unknown; readonly commands: readonly CanonicalCommand[]; readonly rejection?: string } => {
  projectCanonical(state);
  const raw = bendCanonicalStep(state, encode(event));
  switch (tag(raw)) {
    case "Canonical.Advanced": {
      const x = fields(raw, "Canonical.Advanced", ["state", "commands"]);
      known.add(object(x.state)); projectCanonical(x.state);
      return { state: x.state, commands: readList(x.commands, decodeCommand) };
    }
    case "Canonical.Rejected": {
      const x = fields(raw, "Canonical.Rejected", ["state", "reason"]);
      known.add(object(x.state)); projectCanonical(x.state);
      const reason = tag(x.reason);
      if (!/^Canonical\.(InvalidIdentity|RoundLimit|StaleRound|StaleOperation|InconsistentLedger)$/.test(reason)) throw new TypeError("unknown rejection");
      return { state: x.state, commands: [], rejection: reason.slice("Canonical.".length) };
    }
    default: throw new TypeError("unknown canonical step");
  }
};
