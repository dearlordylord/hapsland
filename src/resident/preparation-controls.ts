import { Context, Effect, Layer, Schema } from "effect";

export type ReuseBoundary = "ownerClaimed" | "claimJoined";

export class PreparationControlError extends Schema.TaggedError<PreparationControlError>()(
  "PreparationControlError", { phase: Schema.Literals(["ownerClaimed", "claimJoined"]) },
) {}

export interface PreparationControls {
  readonly afterReuseBoundary: (phase: ReuseBoundary) => Effect.Effect<void, PreparationControlError>;
}

/** Local preparation coordination; this service is never decoded from IPC. */
export class ResidentPreparationControls extends Context.Service<ResidentPreparationControls, PreparationControls>()(
  "@hapsland/ResidentPreparationControls",
) {}

export const preparationControlsLayer = Layer.succeed(ResidentPreparationControls, ResidentPreparationControls.of({
  afterReuseBoundary: Effect.fn("ResidentPreparationControls.afterReuseBoundary")((_phase: ReuseBoundary) => Effect.void),
}));
