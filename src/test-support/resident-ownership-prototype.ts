import { Context, Effect, Layer, Ref, type Scope } from "effect";
import { initialCanonical, projectCanonical, stepCanonical, type CanonicalCommand, type CanonicalEvent } from "../canonical/adapter.ts";
import type { CapacityLimits } from "../resident/capacity.ts";

// Disposable ownership experiment. Delete when the production ResidentState
// replaces the distributed owners; move these cases to resident conformance.
type Result = ReturnType<typeof stepCanonical>;
type Start = Extract<CanonicalCommand, { readonly kind: "dispatchStarted" }>;
export interface NativeJob {
  readonly operation: number;
  readonly partition: number;
  readonly round: number;
  readonly run: () => Promise<void>;
}
interface State {
  readonly canonical: unknown;
  readonly jobs: ReadonlyMap<number, NativeJob>;
  readonly pending: ReadonlyMap<number, Start>;
}
interface Interface {
  readonly commit: (event: CanonicalEvent, job?: NativeJob) => Effect.Effect<Result>;
  readonly inspect: () => Effect.Effect<{
    readonly projection: ReturnType<typeof projectCanonical>;
    readonly registered: readonly number[];
    readonly pending: readonly number[];
  }>;
  readonly takeStarts: () => Effect.Effect<readonly { readonly command: Start; readonly job: NativeJob }[]>;
}
export class OwnershipPrototype extends Context.Service<OwnershipPrototype, Interface>()("@hapsland/test/OwnershipPrototype") {}

export const ownershipPrototypeLayer = (limits: CapacityLimits) => Layer.effect(
  OwnershipPrototype,
  Effect.gen(function* () {
    const state = yield* Ref.make<State>({ canonical: initialCanonical(limits), jobs: new Map(), pending: new Map() });
    const commit = Effect.fn("OwnershipPrototype.commit")(function* (event: CanonicalEvent, job?: NativeJob) {
      return yield* Ref.modify(state, (current): readonly [Result, State] => {
        const result = stepCanonical(current.canonical, event);
        if (result.rejection !== undefined) return [result, current];
        // Stage registration before publishing either half. No handle acquisition
        // or mutation of current maps occurs inside the transaction.
        const jobs = new Map(current.jobs);
        const pending = new Map(current.pending);
        if (event.kind === "queueDispatch") {
          if (job === undefined || job.operation !== event.operation || job.partition !== event.partition ||
              job.round !== event.round || jobs.has(job.operation)) throw new Error("invalid native registration");
          jobs.set(job.operation, job);
        }
        for (const command of result.commands) {
          if (command.kind === "dispatchStarted") {
            if (!jobs.has(command.operation)) throw new Error("start without registered handle");
            pending.set(command.operation, command);
          } else if (command.kind === "dispatchDiscarded" && !command.running) {
            jobs.delete(command.operation);
            pending.delete(command.operation);
          }
        }
        if (event.kind === "dispatchSettled") {
          jobs.delete(event.operation);
          pending.delete(event.operation);
        }
        const dispatch = projectCanonical(result.state).dispatch;
        const live = [...dispatch.queued, ...dispatch.running].map((entry) => entry.operation);
        if (live.length !== jobs.size || live.some((id) => !jobs.has(id))) throw new Error("canonical/native divergence");
        return [result, { canonical: result.state, jobs, pending }];
      });
    });
    return OwnershipPrototype.of({
      commit,
      inspect: Effect.fn("OwnershipPrototype.inspect")(function* () {
        const current = yield* Ref.get(state);
        return { projection: projectCanonical(current.canonical), registered: [...current.jobs.keys()], pending: [...current.pending.keys()] };
      }),
      takeStarts: Effect.fn("OwnershipPrototype.takeStarts")(function* () {
        return yield* Ref.modify(state, (current) => {
          const starts = [...current.pending.values()].map((command) => {
            const job = current.jobs.get(command.operation);
            if (job === undefined) throw new Error("pending command lost its handle");
            return { command, job };
          });
          return [starts, { ...current, pending: new Map() }] as const;
        });
      }),
    });
  }),
);

// This must be acquired in the resident scope, never in an IPC subscriber scope.
// The claim/fork handoff cannot be interrupted. A non-cooperative Promise keeps
// its fiber and canonical running slot until physical settlement, even at close.
export const startPrototypeCommands: () => Effect.Effect<void, never, OwnershipPrototype | Scope.Scope> = Effect.fn("OwnershipPrototype.startCommands")(function* () {
  const owner = yield* OwnershipPrototype;
  yield* Effect.uninterruptible(Effect.gen(function* () {
    const starts = yield* owner.takeStarts();
    for (const { job } of starts) {
      const execute = Effect.gen(function* () {
        yield* Effect.tryPromise({ try: job.run, catch: () => undefined }).pipe(Effect.catch(() => Effect.void));
        const result = yield* owner.commit({ kind: "dispatchSettled", partition: job.partition, lifetime: 1,
          round: job.round, operation: job.operation });
        if (result.rejection !== undefined) return yield* Effect.die(new Error("physical settlement refused"));
        yield* startPrototypeCommands();
      });
      yield* Effect.forkScoped(Effect.uninterruptible(execute));
    }
  }));
});
