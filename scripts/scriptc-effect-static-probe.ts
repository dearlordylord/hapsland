import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { readFileSync } from "node:fs"

// Control only: validates static Effect/Schema compilation, not hook compatibility.
const Request = Schema.Struct({ value: Schema.Int })
const run = Effect.gen(function* () {
  const input: unknown = JSON.parse(readFileSync(0, "utf8"))
  const request = yield* Schema.decodeUnknownEffect(Request)(input)
  const result = yield* Effect.succeed(request.value + 1)
  return { value: result }
}).pipe(Effect.scoped)

const output = await Effect.runPromise(run)
process.stdout.write(`${JSON.stringify(output)}\n`)
