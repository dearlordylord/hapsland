import { bendCanonicalInitial, bendCanonicalInventory, bendCanonicalPartitionUsage, bendCanonicalStep, bendCanonicalTotal } from "./canonical.generated.js";

const MAX_NAT = 2 ** 48 - 1;
export const CANONICAL_MAX_BYTES = 2 ** 47 - 1;
const MAX_BYTES = CANONICAL_MAX_BYTES;
export const CANONICAL_MAX_UNITS = 1024;
const MAX_UNITS = CANONICAL_MAX_UNITS;
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
const readList = <T>(value: unknown, decode: (item: unknown) => T, limit = 2048): T[] => {
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
  | { readonly kind: "reserveCapacity"; readonly partition: number; readonly bytes: number; readonly purpose: CapacityPurpose }
  | { readonly kind: "resizeCapacity"; readonly reservation: number; readonly bytes: number; readonly purpose: CapacityPurpose }
  | { readonly kind: "releaseCapacity"; readonly reservation: number }
  | { readonly kind: "replaceCapacity"; readonly reservation: number; readonly unitBytes: readonly number[] }
  | { readonly kind: "openRound"; readonly partition: number; readonly lifetime: number }
  | { readonly kind: "beginPreparation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly bytes: number }
  | { readonly kind: "preparationCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly unitBytes: readonly number[] }
  | { readonly kind: "reviewCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "finding" | "clear" | "unavailable" }
  | { readonly kind: "stopPolled"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly deadline: boolean }
  | { readonly kind: "outputStarted"; readonly partition: number; readonly lifetime: number; readonly round: number }
  | { readonly kind: "outputTerminal"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "retirePartition"; readonly partition: number; readonly lifetime: number; readonly round: number };

export type CanonicalCommand =
  | { readonly kind: "capacityGranted"; readonly id: number; readonly after: CapacityView }
  | { readonly kind: "capacityRefused"; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "capacityResized"; readonly id: number; readonly after: CapacityView }
  | { readonly kind: "capacityUnitAdmitted"; readonly reservation: number; readonly position: number; readonly bytes: number; readonly after: CapacityView }
  | { readonly kind: "capacityUnitRefused"; readonly position: number; readonly bytes: number; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "roundStarted"; readonly id: number }
  | { readonly kind: "prepare"; readonly operation: number; readonly reservation: number }
  | { readonly kind: "preparationRefused" }
  | { readonly kind: "unitAdmitted"; readonly operation: number; readonly reservation: number; readonly position: number; readonly bytes: number; readonly after: CapacityView }
  | { readonly kind: "unitRefused"; readonly position: number; readonly bytes: number; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "preparationReleased"; readonly id: number; readonly after: CapacityView }
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

const encodePurpose = (value: CapacityPurpose): unknown => {
  const names: Record<CapacityPurpose, string> = {
    observationDispatch: "Ledger.ObservationDispatch", preparation: "Ledger.Preparation",
    reviewUnit: "Ledger.ReviewUnit", storedResult: "Ledger.StoredResult",
    operationalNotice: "Ledger.OperationalNotice", adviceRecheck: "Ledger.AdviceRecheck",
  };
  const name = names[value];
  if (!name) throw new TypeError("invalid capacity purpose");
  return { $: name };
};
const identity = (event: Extract<CanonicalEvent, { readonly lifetime: number }>) => ({ partition: nat(event.partition, true), lifetime: nat(event.lifetime, true) });
const encode = (event: CanonicalEvent): unknown => {
  switch (event.kind) {
    case "reserveCapacity": inputFields(event, ["kind", "partition", "bytes", "purpose"]); return { $: "Canonical.ReserveCapacity", partition: nat(event.partition, true), bytes: bytes(event.bytes), purpose: encodePurpose(event.purpose) };
    case "resizeCapacity": inputFields(event, ["kind", "reservation", "bytes", "purpose"]); return { $: "Canonical.ResizeCapacity", reservation: nat(event.reservation, true), bytes: nat(event.bytes), purpose: encodePurpose(event.purpose) };
    case "releaseCapacity": inputFields(event, ["kind", "reservation"]); return { $: "Canonical.ReleaseCapacity", reservation: nat(event.reservation, true) };
    case "replaceCapacity": inputFields(event, ["kind", "reservation", "unitBytes"]); return { $: "Canonical.ReplaceCapacity", reservation: nat(event.reservation, true), unit_bytes: list(event.unitBytes) };
    case "openRound": inputFields(event, ["kind", "partition", "lifetime"]); return { $: "Canonical.OpenRound", ...identity(event) };
    case "beginPreparation": inputFields(event, ["kind", "partition", "lifetime", "round", "bytes"]); return { $: "Canonical.BeginPreparation", ...identity(event), round: nat(event.round, true), bytes: bytes(event.bytes) };
    case "preparationCompleted": inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "unitBytes"]); return { $: "Canonical.PreparationCompleted", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), unit_bytes: list(event.unitBytes) };
    case "reviewCompleted": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { finding: "Canonical.Finding", clear: "Canonical.Clear", unavailable: "Canonical.Unavailable" }[event.outcome];
      if (!outcome) throw new TypeError("invalid review outcome");
      return { $: "Canonical.ReviewCompleted", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "stopPolled": inputFields(event, ["kind", "partition", "lifetime", "round", "deadline"]); return { $: "Canonical.StopPolled", ...identity(event), round: nat(event.round, true), deadline: bool(event.deadline) };
    case "outputStarted": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.OutputStarted", ...identity(event), round: nat(event.round, true) };
    case "outputTerminal": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      if (!outcome) throw new TypeError("invalid write outcome");
      return { $: "Canonical.OutputTerminal", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "retirePartition": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.RetirePartition", ...identity(event), round: nat(event.round, true) };
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
export type CapacityRefusal = "globalItems" | "globalBytes" | "partitionItems" | "partitionBytes";
export type CapacityView = {
  readonly global: { readonly items: number; readonly bytes: number };
  readonly local: { readonly items: number; readonly bytes: number };
  readonly charges: readonly CapacityCharge[];
};
export type CapacityPurpose = "observationDispatch" | "preparation" | "reviewUnit" | "storedResult" | "operationalNotice" | "adviceRecheck";
export type CapacityCharge = { readonly id: number; readonly partition: number; readonly bytes: number; readonly purpose: CapacityPurpose };
const purpose = (value: unknown): CapacityPurpose => {
  const names: Record<string, CapacityPurpose> = {
    "Ledger.ObservationDispatch": "observationDispatch", "Ledger.Preparation": "preparation",
    "Ledger.ReviewUnit": "reviewUnit", "Ledger.StoredResult": "storedResult",
    "Ledger.OperationalNotice": "operationalNotice", "Ledger.AdviceRecheck": "adviceRecheck",
  };
  const name = tag(value);
  const result = names[name];
  if (!result) throw new TypeError("unknown capacity purpose");
  fields(value, name, []);
  return result;
};
const charge = (value: unknown): CapacityCharge => {
  const x = fields(value, "Ledger.Charge", ["id", "partition", "bytes", "purpose"]);
  return { id: nat(x.id, true), partition: nat(x.partition, true), bytes: nat(x.bytes), purpose: purpose(x.purpose) };
};
const usage = (value: unknown): { readonly items: number; readonly bytes: number } => {
  const x = fields(value, "Ledger.Usage", ["items", "bytes"]);
  return { items: nat(x.items), bytes: nat(x.bytes) };
};
const capacityView = (value: unknown): CapacityView => {
  const x = fields(value, "Canonical.CapacityView", ["global", "local", "charges"]);
  const charges = readList(x.charges, charge);
  const global = usage(x.global);
  const local = usage(x.local);
  if (charges.length !== global.items || charges.reduce((sum, charge) => sum + charge.bytes, 0) !== global.bytes ||
      local.items > global.items || local.bytes > global.bytes) throw new TypeError("invalid capacity view");
  return { global, local, charges };
};
const capacityRefusal = (value: unknown): CapacityRefusal => {
  const reasons: Record<string, CapacityRefusal> = {
    "Ledger.GlobalItemLimit": "globalItems", "Ledger.GlobalByteLimit": "globalBytes",
    "Ledger.PartitionItemLimit": "partitionItems", "Ledger.PartitionByteLimit": "partitionBytes",
  };
  const reason = reasons[tag(value)];
  if (!reason) throw new TypeError("unknown capacity refusal");
  fields(value, tag(value), []);
  return reason;
};
const decodeCommand = (value: unknown): CanonicalCommand => {
  switch (tag(value)) {
    case "Canonical.CapacityGranted": { const x = fields(value, "Canonical.CapacityGranted", ["id", "after"]); return { kind: "capacityGranted", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityRefused": { const x = fields(value, "Canonical.CapacityRefused", ["reason", "after"]); return { kind: "capacityRefused", reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.CapacityResized": { const x = fields(value, "Canonical.CapacityResized", ["id", "after"]); return { kind: "capacityResized", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitAdmitted": { const x = fields(value, "Canonical.CapacityUnitAdmitted", ["reservation", "position", "bytes", "after"]); return { kind: "capacityUnitAdmitted", reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitRefused": { const x = fields(value, "Canonical.CapacityUnitRefused", ["position", "bytes", "reason", "after"]); return { kind: "capacityUnitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.RoundStarted": return { kind: "roundStarted", id: nat(fields(value, "Canonical.RoundStarted", ["id"]).id, true) };
    case "Canonical.Prepare": { const x = fields(value, "Canonical.Prepare", ["operation", "reservation"]); return { kind: "prepare", operation: nat(x.operation, true), reservation: nat(x.reservation, true) }; }
    case "Canonical.PreparationRefused": fields(value, "Canonical.PreparationRefused", []); return { kind: "preparationRefused" };
    case "Canonical.UnitAdmitted": { const x = fields(value, "Canonical.UnitAdmitted", ["operation", "reservation", "position", "bytes", "after"]); return { kind: "unitAdmitted", operation: nat(x.operation, true), reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.UnitRefused": { const x = fields(value, "Canonical.UnitRefused", ["position", "bytes", "reason", "after"]); return { kind: "unitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.PreparationReleased": { const x = fields(value, "Canonical.PreparationReleased", ["id", "after"]); return { kind: "preparationReleased", id: nat(x.id, true), after: capacityView(x.after) }; }
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
  readonly limits: { readonly globalItems: number; readonly globalBytes: number; readonly partitionItems: number; readonly partitionBytes: number };
  readonly partitions: readonly { readonly partition: number; readonly items: number; readonly bytes: number }[];
  readonly charges: readonly CapacityCharge[];
  readonly inventory: readonly { readonly purpose: CapacityPurpose; readonly limits: CanonicalProjection["limits"] }[];
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
  const charges = readList(ledger.charges, charge);
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
  if (chargeIds.size !== charges.length || work.length > charges.length ||
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
  const total = fields(bendCanonicalTotal(state), "Ledger.Usage", ["items", "bytes"]);
  const global = { items: nat(total.items), bytes: nat(total.bytes) };
  if (global.items !== charges.length || global.bytes !== usedBytes) throw new TypeError("Bend ledger total mismatch");
  const partitionIds = [...new Set([...rounds.map((round) => round.partition), ...charges.map((item) => item.partition)])];
  const partitions = partitionIds.map((partition) => {
    const usage = fields(bendCanonicalPartitionUsage(state, partition), "Ledger.Usage", ["items", "bytes"]);
    return { partition, items: nat(usage.items), bytes: nat(usage.bytes) };
  });
  const inventory = readList(bendCanonicalInventory(state), (entry) => {
    const x = fields(entry, "Ledger.InventoryEntry", ["purpose", "limits"]);
    const entryLimits = fields(x.limits, "Ledger.Limits", ["global_items", "global_bytes", "partition_items", "partition_bytes"]);
    return { purpose: purpose(x.purpose), limits: {
      globalItems: nat(entryLimits.global_items, true), globalBytes: nat(entryLimits.global_bytes, true),
      partitionItems: nat(entryLimits.partition_items, true), partitionBytes: nat(entryLimits.partition_bytes, true),
    } };
  });
  if (inventory.length !== 6 || new Set(inventory.map((entry) => entry.purpose)).size !== 6 ||
      inventory.some((entry) => entry.limits.globalItems !== limits.global_items ||
        entry.limits.globalBytes !== limits.global_bytes ||
        entry.limits.partitionItems !== limits.partition_items ||
        entry.limits.partitionBytes !== limits.partition_bytes)) throw new TypeError("inconsistent capacity inventory");
  return { global,
    limits: { globalItems: nat(limits.global_items, true), globalBytes: nat(limits.global_bytes, true),
      partitionItems: nat(limits.partition_items, true), partitionBytes: nat(limits.partition_bytes, true) },
    partitions, charges, inventory, rounds, work };
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
