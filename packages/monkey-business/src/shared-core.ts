import { type EngineState } from "../../monkey-business-bend/engine.mjs";
import { type CanonicalEvent, type initialCanonical } from "../../../src/canonical/adapter.ts";
import { initialSharedCanonical, projectSharedCanonical, stepSharedCanonical, stepSharedGraph, retireSharedGraph, driveSharedCommand, editSharedCanonical, enqueueShared, takeShared, queuedShared, cancelShared, fenceSharedCanonical, preparationFactTime, preparationCompletedAction, revalidateSharedCanonical } from "../../../src/canonical/simulation-adapter.ts";
import { decodeImportGraphStep, encodeImportGraphEvent, projectImportGraph, initialImportGraph } from "../../../src/canonical/graph-adapter.ts";
import { readRecord } from "../../../src/canonical/boundary-schema.ts";
import type { PreparationEvent, PreparationFrame } from "./preparation.ts";

/** The shared Bend owner holds both production reducers; this boundary validates and projects. */
export class SharedCore {
  private state: EngineState;
  private queuedProjection: ReturnType<typeof queuedShared> | undefined;
  constructor(limits: Parameters<typeof initialCanonical>[0]) {
    this.state = initialSharedCanonical(limits);
  }
  get projection() { return projectSharedCanonical(this.state); }
  step(event: CanonicalEvent) {
    const transition = stepSharedCanonical(this.state, event);
    const result = transition.result;
    this.state = transition.state;
    return { ...result, afterActions: transition.afterActions };
  }
  graphStep(event: PreparationEvent): PreparationFrame {
    const limits = readRecord(readRecord(initialImportGraph()).graph).limits;
    const key = { $: "Types.GraphKey", partition: BigInt(event.partition), lifetime: BigInt(event.lifetime),
      round: BigInt(event.round), operation: BigInt(event.operation), unit: BigInt(event.unit) };
    const transition = stepSharedGraph(this.state, key, BigInt(event.step), limits, encodeImportGraphEvent(event.fact));
    const result = decodeImportGraphStep(transition.result);
    const before = projectImportGraph(transition.before);
    this.state = transition.state;
    return { event, before, after: projectImportGraph(result.state), command: result.command };
  }
  preparationFactTime(delay: number, index: number, count: number) { return preparationFactTime(delay, index, count); }
  preparationCompleted(binding: { partition: number; lifetime: number; round: number; operation: number }, units: readonly number[], delay: number) { return preparationCompletedAction(binding, units, delay); }
  enqueue(at: number, order: number) { this.state = enqueueShared(this.state, at, order); this.queuedProjection = undefined; }
  take() { const result = takeShared(this.state); this.state = result.state; this.queuedProjection = undefined; return result.entry; }
  get queued() { return this.queuedProjection ??= queuedShared(this.state); }
  cancel(order: number) { this.state = cancelShared(this.state, order); this.queuedProjection = undefined; }
  edit(partition: number, lifetime: number) { return editSharedCanonical(this.state, partition, lifetime); }
  revalidate(context: unknown) { return revalidateSharedCanonical(this.state, context); }
  fence(event: CanonicalEvent, generated: boolean, context: unknown) { return fenceSharedCanonical(this.state, event, generated, context); }
  handle(event: CanonicalEvent, index: number, context: unknown) { return driveSharedCommand(this.state, event, index, context); }
  retire(operation: number) { this.state = retireSharedGraph(this.state, operation); }
}
