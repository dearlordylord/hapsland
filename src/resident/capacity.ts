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
  readonly #limits: CapacityLimits;
  readonly #reservations = new Map<number, CapacityReservation>();
  readonly #partitions = new Map<string, { items: number; bytes: number }>();
  #nextId = 1;
  #items = 0;
  #bytes = 0;

  constructor(limits: CapacityLimits = defaultLimits) {
    this.#limits = limits;
  }

  reserve(partition: string, bytes: number): CapacityReservation | undefined {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return undefined;
    const local = this.#partitions.get(partition) ?? { items: 0, bytes: 0 };
    if (
      this.#items + 1 > this.#limits.globalItems ||
      this.#bytes + bytes > this.#limits.globalBytes ||
      local.items + 1 > this.#limits.partitionItems ||
      local.bytes + bytes > this.#limits.partitionBytes
    ) return undefined;

    const reservation = { id: this.#nextId++, partition, bytes };
    this.#reservations.set(reservation.id, reservation);
    this.#items += 1;
    this.#bytes += bytes;
    this.#partitions.set(partition, { items: local.items + 1, bytes: local.bytes + bytes });
    return reservation;
  }

  resize(reservation: CapacityReservation, bytes: number): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation || !Number.isSafeInteger(bytes) || bytes < 0) return false;
    const delta = bytes - reservation.bytes;
    const local = this.#partitions.get(reservation.partition);
    if (local === undefined) return false;
    if (
      this.#bytes + delta > this.#limits.globalBytes ||
      local.bytes + delta > this.#limits.partitionBytes
    ) return false;
    this.#bytes += delta;
    this.#partitions.set(reservation.partition, { items: local.items, bytes: local.bytes + delta });
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
    this.release(reservation);
    return bytes.map((size) => this.reserve(partition, size));
  }

  release(reservation: CapacityReservation): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation) return false;
    this.#reservations.delete(reservation.id);
    this.#items -= 1;
    this.#bytes -= reservation.bytes;
    const local = this.#partitions.get(reservation.partition);
    if (local !== undefined) {
      if (local.items === 1) this.#partitions.delete(reservation.partition);
      else this.#partitions.set(reservation.partition, {
        items: local.items - 1,
        bytes: local.bytes - reservation.bytes,
      });
    }
    return true;
  }

  clear(): void {
    this.#reservations.clear();
    this.#partitions.clear();
    this.#items = 0;
    this.#bytes = 0;
  }

  snapshot(): CapacitySnapshot {
    return {
      items: this.#items,
      bytes: this.#bytes,
      partitions: Object.fromEntries(this.#partitions),
    };
  }
}
