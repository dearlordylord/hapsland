import {
  bendLedgerClear,
  bendLedgerInitial,
  bendLedgerPartitionUsage,
  bendLedgerRelease,
  bendLedgerReserve,
  bendLedgerResize,
  bendLedgerTotal,
  type BendLedger,
} from "./bend-ledger.generated.js";

export const GLOBAL_ITEM_LIMIT = 64;
export const GLOBAL_BYTE_LIMIT = 8 * 1024 * 1024;
export const PARTITION_ITEM_LIMIT = 16;
export const PARTITION_BYTE_LIMIT = 2 * 1024 * 1024;

export type CapacityLimits = {
  readonly globalItems: number;
  readonly globalBytes: number;
  readonly partitionItems: number;
  readonly partitionBytes: number;
};

export type CapacityReservation = {
  readonly id: number;
  readonly partition: string;
  readonly bytes: number;
};

export type CapacitySnapshot = {
  readonly items: number;
  readonly bytes: number;
  readonly partitions: Readonly<Record<string, { readonly items: number; readonly bytes: number }>>;
};

const defaultLimits: CapacityLimits = {
  globalItems: GLOBAL_ITEM_LIMIT,
  globalBytes: GLOBAL_BYTE_LIMIT,
  partitionItems: PARTITION_ITEM_LIMIT,
  partitionBytes: PARTITION_BYTE_LIMIT,
};

/** Measure an untrusted logical payload without allowing unknown output size. */
export const encodedBytesWithin = (value: unknown, maximum: number): number | undefined => {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) return undefined;
    const bytes = Buffer.byteLength(encoded, "utf8");
    return bytes <= maximum ? bytes : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Atomic, synchronous accounting for logical resident state. A reservation is
 * an opaque capability: releasing it twice or releasing a foreign value is a
 * no-op, so terminal/finalizer paths can safely converge on one cleanup call.
 */
export class CapacityLedger {
  readonly #reservations = new Map<number, CapacityReservation>();
  readonly #partitionIds = new Map<string, bigint>();
  #nextPartitionId = 1n;
  #state: BendLedger;

  constructor(limits: CapacityLimits = defaultLimits) {
    this.#state = bendLedgerInitial({
      $: "Limits",
      global_items: limits.globalItems,
      global_bytes: limits.globalBytes,
      partition_items: limits.partitionItems,
      partition_bytes: limits.partitionBytes,
    });
  }

  reserve(partition: string, bytes: number): CapacityReservation | undefined {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return undefined;
    let partitionId = this.#partitionIds.get(partition);
    if (partitionId === undefined) {
      partitionId = this.#nextPartitionId++;
      this.#partitionIds.set(partition, partitionId);
    }
    let result;
    try {
      result = bendLedgerReserve(this.#state, partitionId, bytes);
    } catch {
      return undefined;
    }
    if (result.$ !== "Granted" || result.id > BigInt(Number.MAX_SAFE_INTEGER) ||
        result.state.$ !== "Ledger") return undefined;
    const id = Number(result.id);
    if (this.#reservations.has(id)) return undefined;
    this.#state = result.state;
    const reservation = { id, partition, bytes };
    this.#reservations.set(reservation.id, reservation);
    return reservation;
  }

  resize(reservation: CapacityReservation, bytes: number): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation || !Number.isSafeInteger(bytes) || bytes < 0) return false;
    let result;
    try {
      result = bendLedgerResize(this.#state, reservation.id, bytes);
    } catch {
      return false;
    }
    if (result.$ !== "Granted" || result.id !== BigInt(reservation.id) ||
        result.state.$ !== "Ledger") return false;
    this.#state = result.state;
    (reservation as { bytes: number }).bytes = bytes;
    return true;
  }

  /** Atomically replace one workspace charge with independently retained items. */
  replace(
    reservation: CapacityReservation,
    bytes: ReadonlyArray<number>,
  ): ReadonlyArray<CapacityReservation | undefined> {
    if (this.#reservations.get(reservation.id) !== reservation) return bytes.map(() => undefined);
    const partition = reservation.partition;
    if (!this.release(reservation)) return bytes.map(() => undefined);
    return bytes.map((size) => this.reserve(partition, size));
  }

  release(reservation: CapacityReservation): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation) return false;
    let result;
    try {
      result = bendLedgerRelease(this.#state, reservation.id);
    } catch {
      return false;
    }
    if (result.$ !== "Granted" || result.id !== BigInt(reservation.id) ||
        result.state.$ !== "Ledger") return false;
    this.#state = result.state;
    this.#reservations.delete(reservation.id);
    const partitionId = this.#partitionIds.get(reservation.partition);
    if (partitionId !== undefined && bendLedgerPartitionUsage(this.#state, partitionId).items === 0n) {
      this.#partitionIds.delete(reservation.partition);
    }
    return true;
  }

  clear(): void {
    this.#state = bendLedgerClear(this.#state);
    this.#reservations.clear();
    this.#partitionIds.clear();
  }

  snapshot(): CapacitySnapshot {
    const total = bendLedgerTotal(this.#state);
    const entries: Array<[string, { items: number; bytes: number }]> = [];
    for (const [partition, id] of this.#partitionIds) {
      const usage = bendLedgerPartitionUsage(this.#state, id);
      if (usage.items > 0n) entries.push([partition, {
        items: Number(usage.items), bytes: Number(usage.bytes),
      }]);
    }
    return {
      items: Number(total.items),
      bytes: Number(total.bytes),
      partitions: Object.fromEntries(entries),
    };
  }
}
