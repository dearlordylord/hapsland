import { CANONICAL_MAX_BYTES, CANONICAL_MAX_UNITS, initialCanonical, projectCanonical, stepCanonical, type CanonicalEvent, type CapacityPurpose } from "../canonical/adapter.ts";
export type { CapacityPurpose } from "../canonical/adapter.ts";

export const GLOBAL_ITEM_LIMIT = 64;
export const GLOBAL_BYTE_LIMIT = 8 * 1024 * 1024;
export const PARTITION_ITEM_LIMIT = 16;
export const PARTITION_BYTE_LIMIT = 2 * 1024 * 1024;
// A retired partition has no mapped round. This positive candidate lets
// QueueDispatch reject it by missing canonical Work instead of native policy.
const RETIRED_DISPATCH_ROUND_CANDIDATE = 1;

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

type ResidentTransition = Extract<CanonicalEvent, { readonly kind:
  "issuePermit" | "consumePermit" | "releasePermit" | "expirePermit" | "closePermitRound" |
  "openRound" | "admitObservation" | "startObservation" | "completeObservation" |
  "interruptObservation" | "beginObservedPreparation" | "interruptPreparation" |
  "preparationCompleted" | "startReview" | "reviewCompleted" | "retireReview" |
  "retirePartition" | "reviewObserved" | "findingCountUpdated" | "preparedOfferCheck" |
  "emptyPreparedCheck" | "reviewFailureCheck" | "queueDispatch" |
  "dispatchSettled" | "discardDispatch" | "dispatchScopeCheck" | "closeDispatch" |
  "stopGroupPolled" | "stopGroupEnded" |
  "collectionReady" | "collectionCredentialCheck" | "collectionCandidateCheck" |
  "collectionOrderCheck" | "collectionExpiryCheck" | "collectionFindingCheck" | "collectionNoticeCheck" |
  "collectionFitCheck" | "collectionReserveLease" | "collectionReleaseLease" | "collectionLeaseCheck" |
  "collectionRetireAdvice" | "collectionClaimBackground" |
  "collectionReleaseBackground" | "collectionExpireBackground" |
  "finishReserve" | "finishRelease" | "finishAuthorize" | "finishTerminal" |
  "finishEnd" | "continuationConsume" |
  "submissionBegin" | "submissionAuthorize" | "submissionTerminal" |
  "submissionRelease" | "submissionForget" | "submissionSuppressCheck" |
  "submissionReofferCheck" | "submissionExpiryCheck" }>;

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
  readonly #roundIds = new Map<string, number>();
  readonly #collectionTokens = new Map<string, number>();
  #nextCollectionToken = 1;
  #nextPartitionId = 1;
  readonly #limits: CapacityLimits;
  #state: unknown;

  constructor(limits: CapacityLimits = defaultLimits) {
    this.#limits = limits;
    this.#state = initialCanonical(limits);
  }

  /** Shared canonical state for resident admission and capacity transitions. */
  partitionId(partition: string): number {
    let id = this.#partitionIds.get(partition);
    if (id === undefined) {
      id = this.#nextPartitionId++;
      this.#partitionIds.set(partition, id);
    }
    return id;
  }

  collectionTokenId(token: string): number {
    let id = this.#collectionTokens.get(token);
    if (id === undefined) {
      id = this.#nextCollectionToken++;
      this.#collectionTokens.set(token, id);
    }
    return id;
  }

  dispatchIdentity(partition: string): { readonly partition: number; readonly round: number } {
    return { partition: this.partitionId(partition), round: this.#roundIds.get(partition) ?? RETIRED_DISPATCH_ROUND_CANDIDATE };
  }

  dispatchScope(namedCount: number, cancelledCount: number, hasUnnamed: boolean): boolean {
    const result = this.transition({ kind: "dispatchScopeCheck", namedCount, cancelledCount, hasUnnamed });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical dispatch scope refused");
    const command = result.commands[0];
    if (command?.kind === "discardNamedOnly") return true;
    if (command?.kind === "discardAllUnfinished") return false;
    throw new Error("invalid canonical dispatch scope command");
  }

  transition(event: ResidentTransition): ReturnType<typeof stepCanonical> {
    const result = stepCanonical(this.#state, event);
    if (result.rejection === undefined) this.#state = result.state;
    return result;
  }

  canonicalProjection(): ReturnType<typeof projectCanonical> {
    return projectCanonical(this.#state);
  }

  acknowledgeStopRelease(id: number): void {
    if (this.canonicalProjection().charges.some((charge) => charge.id === id)) {
      throw new Error("canonical Stop release retained its charge");
    }
    this.#reservations.delete(id);
  }

  roundId(partition: string): number {
    const existing = this.#roundIds.get(partition);
    if (existing !== undefined) return existing;
    const result = this.transition({ kind: "openRound", partition: this.partitionId(partition), lifetime: 1 });
    const command = result.commands[0];
    if (result.rejection !== undefined || command?.kind !== "roundStarted") throw new Error("canonical round admission refused");
    this.#roundIds.set(partition, command.id);
    return command.id;
  }

  admitObservation(partition: string): number {
    const result = this.transition({ kind: "admitObservation", partition: this.partitionId(partition),
      lifetime: 1, round: this.roundId(partition) });
    const command = result.commands[0];
    if (result.rejection !== undefined || command?.kind !== "observationAdmitted") throw new Error("canonical observation admission refused");
    return command.id;
  }

  observation(partition: string, id: number, kind: "startObservation" | "completeObservation" | "interruptObservation"): boolean {
    const round = this.#roundIds.get(partition);
    if (round === undefined) return false;
    const result = this.transition({ kind, partition: this.partitionId(partition), lifetime: 1,
      round, observation: id });
    return result.rejection === undefined && result.commands[0]?.kind ===
      ({ startObservation: "observationStarted", completeObservation: "observationCompleted",
        interruptObservation: "observationInterrupted" } as const)[kind];
  }

  beginObservedPreparation(partition: string, observation: number, bytes: number):
    { readonly operation: number; readonly reservation: CapacityReservation } | undefined {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CANONICAL_MAX_BYTES) return undefined;
    const round = this.#roundIds.get(partition);
    if (round === undefined) return undefined;
    const result = this.transition({ kind: "beginObservedPreparation", partition: this.partitionId(partition),
      lifetime: 1, round, observation, bytes });
    const command = result.commands[0];
    if (result.rejection !== undefined || command === undefined) throw new Error("invalid canonical preparation admission");
    if (command.kind === "preparationRefused") return undefined;
    if (command.kind !== "prepare") throw new Error("unexpected canonical preparation command");
    const reservation: CapacityReservation = { id: command.reservation, partition, bytes, purpose: "preparation" };
    this.#reservations.set(reservation.id, reservation);
    return { operation: command.operation, reservation };
  }

  completePreparation(partition: string, operation: number, reservation: CapacityReservation,
    sizes: readonly number[]): ReadonlyArray<{ readonly operation: number; readonly reservation: CapacityReservation } | undefined> {
    if (this.#reservations.get(reservation.id) !== reservation || sizes.length > CANONICAL_MAX_UNITS ||
        sizes.some((size) => !Number.isSafeInteger(size) || size <= 0 || size > CANONICAL_MAX_BYTES)) {
      throw new TypeError("invalid canonical preparation completion");
    }
    const round = this.#roundIds.get(partition);
    if (round === undefined) throw new Error("canonical preparation round retired");
    const result = this.transition({ kind: "preparationCompleted", partition: this.partitionId(partition),
      lifetime: 1, round, operation, unitBytes: sizes });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "preparationReleased") {
      throw new Error("canonical preparation completion refused");
    }
    this.#reservations.delete(reservation.id);
    const units = result.commands.slice(1).map((command, index) => {
      if (command.kind === "unitRefused" && command.position === index + 1) return undefined;
      if (command.kind !== "unitAdmitted" || command.position !== index + 1) throw new Error("invalid canonical unit admission");
      const unit: CapacityReservation = { id: command.reservation, partition, bytes: command.bytes, purpose: "reviewUnit" };
      this.#reservations.set(unit.id, unit);
      return { operation: command.operation, reservation: unit };
    });
    if (units.length !== sizes.length) throw new Error("canonical unit count mismatch");
    return units;
  }

  startReview(partition: string, operation: number): boolean {
    const round = this.#roundIds.get(partition);
    if (round === undefined) return false;
    const result = this.transition({ kind: "startReview", partition: this.partitionId(partition),
      lifetime: 1, round, operation });
    return result.rejection === undefined && result.commands[0]?.kind === "reviewStarted";
  }

  completeReview(partition: string, operation: number, reservation: CapacityReservation,
    outcome: "finding" | "clear" | "unavailable" | "interrupted" | "discarded"): boolean {
    if (this.#reservations.get(reservation.id) !== reservation) return false;
    const round = this.#roundIds.get(partition);
    if (round === undefined) return false;
    const result = this.transition({ kind: "reviewCompleted", partition: this.partitionId(partition),
      lifetime: 1, round, operation, outcome });
    if (result.rejection !== undefined || result.commands.at(-1)?.kind !== "reviewRecorded") return false;
    if (outcome === "finding") (reservation as { purpose: CapacityPurpose }).purpose = "storedResult";
    else this.#reservations.delete(reservation.id);
    return true;
  }

  observeReview(partition: string, operation: number, reservation: CapacityReservation,
    outcome: "finding" | "clear", currentWork: boolean):
    "retainFinding" | "settleClear" | "settleStaleClear" | "retireStaleFinding" {
    if (this.#reservations.get(reservation.id) !== reservation) throw new Error("unknown review reservation");
    const round = this.#roundIds.get(partition);
    if (round === undefined) throw new Error("canonical review round retired");
    const result = this.transition({ kind: "reviewObserved", partition: this.partitionId(partition),
      lifetime: 1, round, operation, outcome, currentWork });
    const disposition = result.commands.at(-1)?.kind;
    if (result.rejection !== undefined || (disposition !== "retainFinding" && disposition !== "settleClear" &&
        disposition !== "settleStaleClear" && disposition !== "retireStaleFinding")) {
      throw new Error("canonical review observation refused");
    }
    if (disposition === "retainFinding") (reservation as { purpose: CapacityPurpose }).purpose = "storedResult";
    else this.#reservations.delete(reservation.id);
    return disposition;
  }

  preparedOffer(ready: boolean, withinFrame: boolean): "preparedSkipped" | "preparedAdmitted" | "preparedCapacityRefused" {
    const command = this.transition({ kind: "preparedOfferCheck", ready, withinFrame }).commands[0]?.kind;
    if (command !== "preparedSkipped" && command !== "preparedAdmitted" && command !== "preparedCapacityRefused") {
      throw new Error("canonical prepared offer refused");
    }
    return command;
  }

  emptyPrepared(readyCount: number, hasNonSkipped: boolean, ticketed: boolean): boolean {
    const command = this.transition({ kind: "emptyPreparedCheck", readyCount, hasNonSkipped, ticketed }).commands[0]?.kind;
    if (command !== "emptyLost" && command !== "emptyAccepted") throw new Error("canonical empty preparation refused");
    return command === "emptyLost";
  }

  reviewFailure(backendOrTimeout: boolean, credential: boolean, missing: boolean):
    "failureBackend" | "failureCredential" | "failureLost" | "failureNone" {
    const command = this.transition({ kind: "reviewFailureCheck", backendOrTimeout, credential, missing }).commands[0]?.kind;
    if (command !== "failureBackend" && command !== "failureCredential" && command !== "failureLost" && command !== "failureNone") {
      throw new Error("canonical review failure classification refused");
    }
    return command;
  }

  retireRound(partition: string): void {
    const round = this.#roundIds.get(partition);
    if (round === undefined) return;
    const result = this.transition({ kind: "retirePartition", partition: this.partitionId(partition),
      lifetime: 1, round });
    if (result.rejection !== undefined || result.commands.at(-1)?.kind !== "partitionRetired") {
      throw new Error("canonical round retirement refused");
    }
    const live = new Set(this.canonicalProjection().charges.map((charge) => charge.id));
    for (const [id, reservation] of this.#reservations) {
      if (reservation.partition === partition && !live.has(id)) this.#reservations.delete(id);
    }
    this.#roundIds.delete(partition);
  }

  reserve(partition: string, bytes: number, purpose: CapacityPurpose): CapacityReservation | undefined {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > CANONICAL_MAX_BYTES) return undefined;
    const partitionId = this.partitionId(partition);
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
    const work = this.canonicalProjection().work.find((item) => item.reservation === reservation.id);
    if (work !== undefined) {
      const kind = work.kind === "preparing" ? "interruptPreparation" :
        work.kind === "pendingFinding" ? "retireReview" : "reviewCompleted";
      const common = { partition: this.partitionId(reservation.partition), lifetime: 1,
        round: work.round, operation: work.operation };
      const result = kind === "reviewCompleted"
        ? this.transition({ kind: "reviewCompleted", ...common, outcome: "discarded" })
        : kind === "retireReview"
          ? this.transition({ kind: "retireReview", ...common })
          : this.transition({ kind: "interruptPreparation", ...common });
      if (result.rejection !== undefined || !result.commands.some((command) =>
          (command.kind === "preparationReleased" || command.kind === "reservationReleased") &&
          command.id === reservation.id)) throw new Error("canonical work release refused");
      this.#reservations.delete(reservation.id);
      return true;
    }
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
    this.#roundIds.clear();
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
