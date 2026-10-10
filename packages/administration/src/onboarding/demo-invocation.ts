import { HAPSLAND_STATE_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { join } from "node:path"
import { decodeJson } from "../invocation/json-input.ts"

export const FirstReviewDemoOperation = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("demo"),
  selection: Schema.Literals(["preview", "live", "cancel"]),
  codexHome: Schema.optionalKey(Schema.NonEmptyString),
  codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  demoId: Schema.optionalKey(Schema.NonEmptyString),
  selectionDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)))
})

export type FirstReviewDemoOperation = typeof FirstReviewDemoOperation.Type

export const decodeFirstReviewDemoOperation = (input: string) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(FirstReviewDemoOperation, { onExcessProperty: "error" }))
  )

export const runJsonDemo = Effect.fn("Cli.runJsonDemo")(function* (input: string) {
  const { runFirstReviewDemo } = yield* Effect.promise(() => import("./first-review-demo.ts"))
  const operation: FirstReviewDemoOperation = yield* decodeFirstReviewDemoOperation(input)
  const demoStatePath = yield* Config.NonEmptyString("REVIEW_DEMO_STATE_PATH").pipe(
    Config.withDefault(join(HAPSLAND_STATE_DIRECTORY, "demos"))
  )
  return yield* runFirstReviewDemo(operation, { statePath: demoStatePath })
})
