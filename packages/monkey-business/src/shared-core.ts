import { prepareSharedSharing, routeSharedSharing, routedSharedSharing, leaveSharedSharing, completeSharedSharing } from "../../../src/canonical/simulation-adapter.ts";
import { admitSharedFreshness, sharedFreshnessChecks } from "../../../src/canonical/simulation-adapter.ts";
import { encodeFreshnessScope, encodeFreshnessSource, type FreshnessScope, type FreshnessSource } from "./freshness-codec.ts";
import { replaceSharedCallbacks } from "../../../src/canonical/simulation-adapter.ts";
import { sharedNoticeExercise, afterSharedNotice, suppliedSharedNotice, ownedSharedNotice } from "../../../src/canonical/simulation-adapter.ts";
import { issueSharedCallback, sharedCallbackOriginals, deliverSharedCallback, actSharedCallback } from "../../../src/canonical/simulation-adapter.ts";
import { encodePreparationGraphLimits } from "./file-trees.ts";
import { GRAPH_LIMIT_CEILINGS } from "../../../src/canonical/graph-adapter.ts";
import { type EngineState } from "../../monkey-business-bend/engine.mjs";
import { type CanonicalEvent, type initialCanonical } from "../../../src/canonical/adapter.ts";
import { initialSharedCanonical, projectSharedCanonical, stepSharedCanonical, stepSharedGraph, sharedPreparationActive, driveSharedCommand, editSharedCanonical, enqueueShared, takeShared, queuedShared, cancelShared, fenceSharedCanonical, preparationFactTime, preparationCompletedAction, revalidateSharedCanonical } from "../../../src/canonical/simulation-adapter.ts";
import { decodeImportGraphStep, encodeImportGraphEvent, projectImportGraph, initialImportGraph } from "../../../src/canonical/graph-adapter.ts";
import { configureSharedSeed, sharedClock, configureSharedWorkload, actSharedWorkload, validSharedWorkload, preSharedTiming, sampleSharedOutcome } from "../../../src/canonical/simulation-adapter.ts";
import { sessionProfile, type SessionConfig, type SessionControl, type SessionInput } from "./session.ts";
import { doubleWords } from "./numeric-codec.ts";
import { JEV_OUTCOME_ORDER, validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts";
import { sharedCapturedCredential, sharedCredentialMatches, sharedCallbackMatches, issueSharedActions, declareSharedAdvicee, sharedEventScope, sharedCommandScope, configureSharedCredentials, actSharedCredentials, sharedCredentialFacts, interveneSharedRequest } from "../../../src/canonical/simulation-adapter.ts";
import { readRecord } from "../../../src/canonical/boundary-schema.ts";
import type { PreparationEvent, PreparationFrame } from "./preparation.ts";
import { decodeAdviceeLifecycles, encodeAdviceeLifecycle, type AdviceeLifecycleAction } from "./advicee-lifecycle.ts";
import { sharedActivityEventValid, actSharedLifecycle, sharedLifecycleEntries, sharedActivityScope, sharedActivityValid, sharedActivityLifetime, editSharedActivity, issueSharedPermit, issuedSharedPermit, consumedSharedPermit } from "../../../src/canonical/simulation-adapter.ts";

/** The shared Bend owner holds both production reducers; this boundary validates and projects. */
export class SharedCore {
  private state: EngineState;
  private queuedProjection: ReturnType<typeof queuedShared> | undefined;
  constructor(limits: Parameters<typeof initialCanonical>[0], seed = 1) {
    this.state = configureSharedSeed(initialSharedCanonical(limits), seed);
  }
  declareAdvicee(identity: number, seed: number) {
    const declared = declareSharedAdvicee(this.state, identity, seed);
    this.state = declared.state;
    return declared.scope;
  }
  noticeExercise(scope: unknown) { return sharedNoticeExercise(scope); }
  noticeAfter(scope: unknown, event: CanonicalEvent, now: number) {
    const result = afterSharedNotice(this.state, scope, event, now);
    this.state = result.state;
    return result.events;
  }
  noticeFailure(scope: unknown, now: number, key: number, sequence: number) { return suppliedSharedNotice(this.state, scope, now, key, sequence); }
  noticeOwned(partition: number, group: number, key: number, action: "lease" | "acknowledge") { return ownedSharedNotice(this.state, partition, group, key, action); }
  issueCallback(event: CanonicalEvent, order: number, at: number) {
    const issued = issueSharedCallback(this.state, event, order, at);
    this.state = issued.state;
    return issued.receipt;
  }
  get callbackOriginals() { return sharedCallbackOriginals(this.state); }
  replaceCallbacks(orders: readonly number[]) { this.state = replaceSharedCallbacks(this.state, orders); }
  deliverCallback(order: number) { this.state = deliverSharedCallback(this.state, order); }
  callback(target: unknown, action: unknown, receipt: object | undefined, at: number, order: number) {
    const result = actSharedCallback(this.state, target, action, receipt, at, order);
    this.state = result.state;
    return result;
  }
  commandScope(index: number, provided?: number) { return sharedCommandScope(this.state, index, provided); }
  get adviceeLifecycles() { return decodeAdviceeLifecycles(sharedLifecycleEntries(this.state)); }
  activityScope(partition: number) { return sharedActivityScope(this.state, partition); }
  activityEventValid(event: CanonicalEvent, partition: number, incarnation: number) { return sharedActivityEventValid(this.state, event, partition, incarnation); }
  activityValid(partition: number, incarnation: number) { return sharedActivityValid(this.state, partition, incarnation); }
  activityLifetime(partition: number) { return sharedActivityLifetime(this.state, partition); }
  activityEdit(partition: number, incarnation: number) {
    const transition = editSharedActivity(this.state, partition, incarnation);
    this.state = transition.state;
    return transition.plan;
  }
  lifecycle(partition: number, agent: string, action: AdviceeLifecycleAction) {
    const transition = actSharedLifecycle(this.state, partition, encodeAdviceeLifecycle(action));
    this.state = transition.state;
    const changed = readRecord(transition.changed);
    const cleanup = readRecord(transition.cleanup);
    const events: SessionInput[] = transition.events.map(event => {
      const common = { at: event.at, generation: event.generation, agent, recurring: event.recurring };
      if (event.kind === 0) return { ...common, kind: "task", task: event.task };
      if (event.kind === 2) return { ...common, kind: "finish" };
      return { ...common, kind: "edit", bytes: event.bytes, unitBytes: event.units, revision: event.revision, ...(event.repair ? { repair: true } : {}) };
    });
    return { changed, cleanup, events };
  }
  admitFreshness(scope: FreshnessScope, source: FreshnessSource, index: number) {
    const transition = admitSharedFreshness(this.state, encodeFreshnessScope(scope), encodeFreshnessSource(source), index);
    this.state = transition.state;
    return transition.actions;
  }
  prepareSharing(scope: unknown, keys: readonly unknown[], sizes: readonly number[]) {
    const result = prepareSharedSharing(this.state, scope, keys, sizes);
    this.state = result.state;
    return { routes: result.routes, valid: result.valid };
  }
  leaveSharing(scope: unknown) {
    const result = leaveSharedSharing(this.state, scope);
    this.state = result.state;
    return { events: result.events, valid: result.valid };
  }
  completeSharing(event: CanonicalEvent) { return completeSharedSharing(this.state, event); }
  routeSharing(route: unknown) { return routeSharedSharing(this.state, route); }
  routedSharing(route: unknown) {
    const result = routedSharedSharing(this.state, route);
    this.state = result.state;
    return result.events;
  }
  freshnessChecks(scope: FreshnessScope) { return sharedFreshnessChecks(this.state, encodeFreshnessScope({ partition: scope.partition, lifetime: scope.lifetime, round: scope.round, operation: scope.operation })); }
  issuePermit(capture: unknown, issuanceNow: number) { return issueSharedPermit(this.state, capture, issuanceNow); }
  issuedPermit(capture: unknown, token: number) { return issuedSharedPermit(this.state, capture, token); }
  consumedPermit(index: number, partition: number, lifetime: number) { return consumedSharedPermit(this.state, index, partition, lifetime); }
  eventScope(event: CanonicalEvent, provided?: number) { return sharedEventScope(this.state, event, provided); }
  configureCredentials(available: boolean, generation: number) { this.state = configureSharedCredentials(this.state, available, generation); }
  capturedCredential(operation: number) { return sharedCapturedCredential(this.state, operation); }
  credentialMatches(operation: number) { return sharedCredentialMatches(this.state, operation); }
  callbackMatches(event: CanonicalEvent, target: { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly request: number }) { return sharedCallbackMatches(event, target); }
  credentials(action: "unavailable" | "restore" | "rotate") {
    this.state = actSharedCredentials(this.state, action);
    return sharedCredentialFacts(this.state);
  }
  interveneRequest(target: { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly request: number }, outcome: unknown, delay: number) {
    return interveneSharedRequest(this.state, target, outcome, delay);
  }
  get now() { return sharedClock(this.state); }
  preTiming(partition: number, duration: number | undefined, fallback: number, lifetime: number) { return preSharedTiming(this.state, partition, duration, fallback, lifetime); }
  sample(weights: OutcomeWeights) {
    const values = validateOutcomeWeights(weights);
    const encoded = JEV_OUTCOME_ORDER.map(kind => doubleWords(values[kind])).reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
    const next = sampleSharedOutcome(this.state, encoded);
    this.state = next.state;
    return JEV_OUTCOME_ORDER[next.outcome]!;
  }
  workloadAction(partition: number, agent: string, action: unknown): SessionInput[] {
    const changed = actSharedWorkload(this.state, partition, action);
    this.state = changed.state;
    return changed.events.map(event => {
      const common = { at: event.at, generation: event.generation, agent, recurring: event.recurring };
      if (event.kind === 0) return { ...common, kind: "task", task: event.task };
      if (event.kind === 2) return { ...common, kind: "finish" };
      return { ...common, kind: "edit", bytes: event.bytes, unitBytes: event.units, revision: event.revision, ...(event.repair ? { repair: true } : {}) };
    });
  }
  workloadControl(partition: number, agent: string, control: SessionControl | { readonly kind: "editDuration"; readonly durationMs: number }) {
    const native = control.kind === "editPace" ? { $: "Workload.Pace", interval: control.intervalMs }
      : control.kind === "burst" ? { $: "Workload.Burst", count: control.count }
      : control.kind === "suspendArrivals" ? { $: "Workload.Suspend", suspended: control.suspended }
      : control.kind === "editDuration" ? { $: "Workload.Duration", duration: control.durationMs }
      : { $: "Workload.Sizes", bytes: control.reservationBytes, units: control.reviewUnitBytes.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" }) };
    return this.workloadAction(partition, agent, { $: "Workload.Controlled", control: native });
  }
  session(partition: number, config: SessionConfig) {
    const agent = config.agent ?? "agent-1";
    this.state = configureSharedWorkload(this.state, partition, sessionProfile(config));
    return {
      next: (_now: number) => this.workloadAction(partition, agent, { $: "Workload.Next" }),
      apply: (control: SessionControl, _now: number) => this.workloadControl(partition, agent, control),
      valid: (input: { readonly generation?: number; readonly recurring?: boolean }) => validSharedWorkload(this.state, partition, input.generation ?? 0, input.recurring === true),
      onFinish: (_now: number, continuation: boolean) => this.workloadAction(partition, agent, { $: "Workload.Finished", continuation }),
      onAdvice: (_now: number) => this.workloadAction(partition, agent, { $: "Workload.Advice" }),
    };
  }
  get projection() { return projectSharedCanonical(this.state); }
  step(event: CanonicalEvent) {
    const transition = stepSharedCanonical(this.state, event);
    const result = transition.result;
    this.state = transition.state;
    return { ...result, afterActions: transition.afterActions };
  }
  graphStep(event: PreparationEvent): PreparationFrame {
    const limits = encodePreparationGraphLimits(event.graphLimits ?? GRAPH_LIMIT_CEILINGS);
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
  edit(partition: number, lifetime: number) {
    const attempt = editSharedCanonical(this.state, partition, lifetime);
    this.state = attempt.state;
    return attempt.plan;
  }
  revalidate(context: unknown) { return revalidateSharedCanonical(this.state, context); }
  fence(event: CanonicalEvent, generated: boolean, context: unknown) { return fenceSharedCanonical(this.state, event, generated, context); }
  handle(event: CanonicalEvent, index: number, context: unknown) {
    const handled = readRecord(driveSharedCommand(this.state, event, index, context));
    const issued = issueSharedActions(this.state, handled.actions);
    this.state = issued.state;
    return { ...handled, actions: issued.actions };
  }
  preparationActive(event: PreparationEvent) { return sharedPreparationActive(this.state, event.partition, event.lifetime, event.round, event.operation); }
}
