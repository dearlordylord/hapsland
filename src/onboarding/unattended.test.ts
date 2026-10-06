import { Effect } from "effect"
import { expect, it } from "vitest"
import { runUnattendedSetup } from "./unattended.ts"

it.each([
  {
    host: undefined,
    flags: new Map([
      ["--apply-plan", "plan.json"],
      ["--review", "enabled"]
    ]),
    message: "use only --no-input and --json alongside it"
  },
  { host: "codex" as const, flags: new Map([["--apply-plan", "plan.json"]]), message: "omit a positional client" }
])("rejects competing choices before reading a saved plan", async ({ host, flags, message }) => {
  const result = await Effect.runPromise(runUnattendedSetup({ host, flags }).pipe(Effect.result))
  expect(result).toMatchObject({ _tag: "Failure", failure: { message: expect.stringContaining(message) } })
})
