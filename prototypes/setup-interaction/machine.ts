import { Effect, Schema } from "effect"
import { Event as MachineEvent, Machine, State } from "effect-machine"
import { activeHost, hookDigest, saveDigest, type Context, type Event, type Model, type Phase } from "./domain.ts"
// Separate statechart implementation: it does not call the reducer.
const context = Schema.declare<Context>(
  (value): value is Context => typeof value === "object" && value !== null && "revision" in value
)
const event = Schema.declare<Event>(
  (value): value is Event => typeof value === "object" && value !== null && "action" in value
)
const S = State({
  Select: { context },
  Hooks: { context },
  Applying: { context },
  Credential: { context },
  SaveApproval: { context },
  Saving: { context },
  CheckApproval: { context },
  Checking: { context },
  Done: { context },
  Cancelled: { context }
})
const E = MachineEvent({ Input: { event } })
export function withMachine<A>(start: Model, use: (dispatch: (e: Event) => Promise<Model>) => Promise<A>): Promise<A> {
  const to = (phase: Phase, c: Context, patch: Partial<Context> = {}) =>
    S[phase]({ context: { ...c, ...patch, revision: c.revision + 1 } })
  const advance = (c: Context, outcome: string) => {
    const index = c.index + 1
    return to(index < c.hosts.length ? "Hooks" : "Credential", c, {
      index,
      results: { ...c.results, [activeHost({ ...c, phase: "Applying" })]: outcome },
      digest: index < c.hosts.length ? hookDigest(c.hosts, index) : ""
    })
  }
  const matches = (c: Context, e: Event) => c.revision === e.revision
  const observed = (c: Context, e: Event) =>
    matches(c, e) && e.action.kind === "observed" && e.action.commandId === c.revision
  const machine = Machine.make({ state: S, event: E, initial: S[start.phase]({ context: start }) })
    .when(
      S.Select,
      E.Input,
      ({ state, event }) =>
        matches(state.context, event.event) &&
        event.event.action.kind === "select" &&
        event.event.action.hosts.length > 0,
      ({ state, event }) => {
        const a = event.event.action
        return a.kind === "select"
          ? to("Hooks", state.context, { hosts: a.hosts, index: 0, digest: hookDigest(a.hosts, 0) })
          : state
      }
    )
    .when(
      S.Hooks,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "approve",
      ({ state, event }) =>
        event.event.action.kind === "approve" && event.event.action.yes
          ? to("Applying", state.context)
          : advance(state.context, "declined")
    )
    .when(
      S.Applying,
      E.Input,
      ({ state, event }) => observed(state.context, event.event),
      ({ state, event }) =>
        advance(state.context, event.event.action.kind === "observed" ? event.event.action.outcome : "invalid")
    )
    .when(
      S.Credential,
      E.Input,
      ({ state, event }) =>
        matches(state.context, event.event) && event.event.action.kind === "keep" && state.context.source !== "none",
      ({ state }) => to("CheckApproval", state.context)
    )
    .when(
      S.Credential,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "destination",
      ({ state, event }) => {
        const a = event.event.action
        return a.kind !== "destination"
          ? state
          : a.destination === "skip"
            ? to("Done", state.context)
            : to("SaveApproval", state.context, { destination: a.destination, digest: saveDigest(a.destination) })
      }
    )
    .when(
      S.SaveApproval,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "approve",
      ({ state, event }) =>
        event.event.action.kind === "approve" && event.event.action.yes
          ? to("Saving", state.context)
          : to("Credential", state.context, { digest: "" })
    )
    .when(
      S.Saving,
      E.Input,
      ({ state, event }) => observed(state.context, event.event),
      ({ state, event }) =>
        event.event.action.kind === "observed" && event.event.action.outcome === "saved"
          ? to("CheckApproval", state.context, {
              source:
                state.context.source === "environment"
                  ? "environment (saved credential shadowed)"
                  : state.context.destination
            })
          : to("Credential", state.context)
    )
    .when(
      S.CheckApproval,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "approve",
      ({ state, event }) =>
        to(event.event.action.kind === "approve" && event.event.action.yes ? "Checking" : "Done", state.context)
    )
    .when(
      S.Checking,
      E.Input,
      ({ state, event }) => observed(state.context, event.event),
      ({ state, event }) =>
        to("Done", state.context, {
          check: event.event.action.kind === "observed" ? event.event.action.outcome : "invalid"
        })
    )
  // Session navigation exists only on idle states; pending writes must finish.
  const idle = [S.Select, S.Hooks, S.Credential, S.SaveApproval, S.CheckApproval] as const
  let navigable = machine.when(
    idle,
    E.Input,
    ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "cancel",
    ({ state }) => to("Cancelled", state.context)
  )
  navigable = navigable
    .when(
      S.Hooks,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "back",
      ({ state }) => to("Select", state.context, { digest: "" })
    )
    .when(
      S.SaveApproval,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "back",
      ({ state }) => to("Credential", state.context, { digest: "" })
    )
    .when(
      S.CheckApproval,
      E.Input,
      ({ state, event }) => matches(state.context, event.event) && event.event.action.kind === "back",
      ({ state }) => to("Credential", state.context)
    )
  return Effect.runPromise(
    Effect.scoped(
      Machine.scoped(
        Effect.gen(function* () {
          const actor = yield* Machine.spawn(navigable)
          yield* actor.start
          return yield* Effect.promise(() =>
            use(async (e) => {
              await Effect.runPromise(actor.call(E.Input({ event: e })))
              const snapshot = await Effect.runPromise(actor.snapshot)
              return { ...snapshot.context, phase: snapshot._tag }
            })
          )
        })
      )
    )
  )
}
