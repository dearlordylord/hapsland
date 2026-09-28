import type { CapacityLedger } from "./capacity.ts";

/** Read-only work view over the shared canonical state for one composed round. */
export class BendWorkTracker {
  constructor(private readonly ledger: CapacityLedger, private readonly partitions: ReadonlySet<string>) {}

  #work(operation: number) {
    const ids = new Set([...this.partitions].map((partition) => this.ledger.partitionId(partition)));
    return this.ledger.canonicalProjection().work.find((item) =>
      ids.has(item.partition) && item.operation === operation);
  }

  admit(observation: number): number {
    if (this.#work(observation)?.kind !== "sourceQueued") throw new Error("canonical source admission missing");
    return observation;
  }

  spawn(observation: number, operation: number): number | undefined {
    const work = this.#work(operation);
    return work?.parent === observation && work.kind === "reviewing" ? operation : undefined;
  }

  cachedFinding(observation: number, _count: number, _bytes: number, operation: number): number | undefined {
    const work = this.#work(operation);
    return work?.parent === observation && work.kind === "pendingFinding" ? operation : undefined;
  }

  startSource(observation: number): boolean { return this.#work(observation)?.kind === "sourceQueued"; }
  completeSource(observation: number): boolean { return this.#work(observation)?.kind === "sourceReading"; }
  startUnit(operation: number): boolean { return this.#work(operation)?.kind === "reviewing"; }
  outcome(operation: number, _outcome: unknown): boolean { return this.#work(operation)?.kind === "atJev"; }
  reviseFinding(operation: number, _count: number, _bytes: number): boolean {
    return this.#work(operation)?.kind === "pendingFinding";
  }
  retire(operation: number): boolean { return this.#work(operation)?.kind === "pendingFinding"; }

  unfinished(): number {
    const ids = new Set([...this.partitions].map((partition) => this.ledger.partitionId(partition)));
    return this.ledger.canonicalProjection().work.filter((item) =>
      ids.has(item.partition) && item.kind !== "pendingFinding").length;
  }
  pendingFindings(): number {
    return this.ledger.canonicalProjection().pendingFindings.reduce((count, entry) =>
      count + (this.#work(entry.operation)?.kind === "pendingFinding" ? entry.count : 0), 0);
  }
  pendingFor(operation: number): number {
    return this.#work(operation)?.kind === "pendingFinding"
      ? this.ledger.canonicalProjection().pendingFindings.find((entry) => entry.operation === operation)?.count ?? 0
      : 0;
  }
}
