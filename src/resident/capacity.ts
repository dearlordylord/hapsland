import { CANONICAL_MAX_BYTES, CANONICAL_MAX_UNITS, initialCanonical, projectCanonical, stepCanonical, type CapacityPurpose } from "../canonical/adapter.ts";
export type { CapacityPurpose } from "../canonical/adapter.ts";

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
  readonly purpose: CapacityPurpose;
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
  readonly #partitionIds = new Map<string, number>();
  #nextPartitionId = 1;
  readonly #limits: CapacityLimits;
  #state: unknown;

  constructor(limits: CapacityLimits = defaultLimits) {
    this.#limits = limits;
    this.#state = initialCanonical(limits);
  }

  reserve(partition: string, bytes: number, purpose: CapacityPurpose): CapacityReservation | undefined {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CANONICAL_MAX_BYTES) return undefined;
    let partitionId = this.#partitionIds.get(partition);
    if (partitionId === undefined) {
      partitionId = this.#nextPartitionId++;
      this.#partitionIds.set(partition, partitionId);
    }
    const result = stepCanonical(this.#state, { kind: "reserveCapacity", partition: partitionId, bytes, purpose });
    const command = result.commands[0];
    if (result.rejection !== undefined || result.commands.length !== 1 || command === undefined) throw new Error("invalid Bend capacity reservation result");
    if (command.kind === "capacityRefused") return undefined;
    if (command.kind !== "capacityGranted") throw new Error("unexpected Bend capacity reservation command");
    const id = command.id;
    if (this.#reservations.has(id)) throw new Error("Bend reused a live capacity reservation ID");
    this.#state = result.state;
    const reservation = { id, partition, bytes, purpose };
    this.#reservations.set(reservation.id, reservation);
    return reservation;
  }

  resize(reservation: CapacityReservation, bytes: number,
    purpose: CapacityPurpose = reservation.purpose): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation || !Number.isSafeInteger(bytes) || bytes < 0 ||
        bytes > CANONICAL_MAX_BYTES) return false;
    const result = stepCanonical(this.#state, { kind: "resizeCapacity", reservation: reservation.id, bytes, purpose });
    const command = result.commands[0];
    if (result.rejection !== undefined || result.commands.length !== 1 || command === undefined) throw new Error("invalid Bend capacity resize result");
    if (command.kind === "capacityRefused") return false;
    if (command.kind !== "capacityResized" || command.id !== reservation.id) throw new Error("unexpected Bend capacity resize command");
    this.#state = result.state;
    (reservation as { bytes: number; purpose: CapacityPurpose }).bytes = bytes;
    (reservation as { purpose: CapacityPurpose }).purpose = purpose;
    return true;
  }

  /** Atomically replace one workspace charge with independently retained items. */
  replace(
    reservation: CapacityReservation,
    bytes: ReadonlyArray<number>,
  ): ReadonlyArray<CapacityReservation | undefined> {
    if (this.#reservations.get(reservation.id) !== reservation) return bytes.map(() => undefined);
    if (bytes.length > CANONICAL_MAX_UNITS ||
        bytes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > CANONICAL_MAX_BYTES)) {
      this.release(reservation);
      throw new TypeError("invalid measured review unit size");
    }
    const result = stepCanonical(this.#state, { kind: "replaceCapacity", reservation: reservation.id, unitBytes: bytes });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "preparationReleased" ||
        result.commands[0].id !== reservation.id || result.commands.length !== bytes.length + 1) {
      throw new Error("invalid Bend capacity replacement result");
    }
    const replacements = result.commands.slice(1).map((command, index) => {
      if (command.kind === "capacityUnitRefused" && command.position === index + 1 && command.bytes === bytes[index]) return undefined;
      if (command.kind !== "capacityUnitAdmitted" || command.position !== index + 1 || command.bytes !== bytes[index]) {
        throw new Error("unexpected Bend capacity replacement command");
      }
      return { id: command.reservation, partition: reservation.partition, bytes: command.bytes, purpose: "reviewUnit" as const };
    });
    const replacementIds = replacements.flatMap((item) => item === undefined ? [] : [item.id]);
    if (new Set(replacementIds).size !== replacementIds.length ||
        replacementIds.some((id) => this.#reservations.has(id))) {
      throw new Error("Bend reused a live capacity reservation ID");
    }
    this.#state = result.state;
    this.#reservations.delete(reservation.id);
    for (const item of replacements) if (item !== undefined) this.#reservations.set(item.id, item);
    return replacements;
  }

  release(reservation: CapacityReservation): boolean {
    const retained = this.#reservations.get(reservation.id);
    if (retained !== reservation) return false;
    const result = stepCanonical(this.#state, { kind: "releaseCapacity", reservation: reservation.id });
    if (result.rejection !== undefined || result.commands.length !== 1 ||
        result.commands[0]?.kind !== "reservationReleased" || result.commands[0].id !== reservation.id) {
      throw new Error("invalid Bend capacity release result");
    }
    this.#state = result.state;
    this.#reservations.delete(reservation.id);
    return true;
  }

  clear(): void {
    this.#state = initialCanonical(this.#limits);
    this.#reservations.clear();
    this.#partitionIds.clear();
    this.#nextPartitionId = 1;
  }

  snapshot(): CapacitySnapshot {
    const projection = projectCanonical(this.#state);
    const entries: Array<[string, { items: number; bytes: number }]> = [];
    for (const [partition, id] of this.#partitionIds) {
      const usage = projection.partitions.find((item) => item.partition === id);
      if (usage !== undefined && usage.items > 0) entries.push([partition, { items: usage.items, bytes: usage.bytes }]);
    }
    return {
      items: projection.global.items,
      bytes: projection.global.bytes,
      partitions: Object.fromEntries(entries),
    };
  }
}
