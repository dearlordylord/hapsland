import * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"

export class ResidentAdapterError extends Schema.TaggedError<ResidentAdapterError>()("ResidentAdapterError", {
  operation: Schema.String
}) {}

export const residentAdapter = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ResidentAdapterError({ operation }) })
