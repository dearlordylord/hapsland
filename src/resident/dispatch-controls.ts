import { Context, Effect, Layer, Schema } from "effect"

export type DispatchBoundary = "authorized" | "credentialResolved"

export class DispatchControlError extends Schema.TaggedError<DispatchControlError>()("DispatchControlError", {
  phase: Schema.Literals(["authorized", "credentialResolved"])
}) {}

/** Local dispatch coordination; not part of the resident IPC contract. */
export class ResidentDispatchControls extends Context.Service<
  ResidentDispatchControls,
  { readonly atBoundary: (phase: DispatchBoundary) => Effect.Effect<void, DispatchControlError> }
>()("@hapsland/ResidentDispatchControls") {}

export const defaultDispatchControls = ResidentDispatchControls.of({
  atBoundary: Effect.fn("ResidentDispatchControls.atBoundary")((_phase: DispatchBoundary) => Effect.void)
})
export const dispatchControlsLayer = Layer.succeed(ResidentDispatchControls, defaultDispatchControls)
