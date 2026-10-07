// Prototype: workflow/interaction seam qualification, all owners synthetic.
import assert from "node:assert/strict"
import { Deferred, Effect, Exit, Fiber, Redacted } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { workflowGuards } from "./workflow-guards.ts"
import { runWorkflowScenarios } from "./workflow-scenarios.ts"
import { fakeCredentialOwner } from "./credential-owner.ts"
import { runVerification } from "./verification-flow.ts"
import { runLogin } from "./login-flow.ts"
import { scriptedInteraction } from "./scripted-interaction.ts"
const scenarios = await runWorkflowScenarios()
const guards = await workflowGuards()
const timeout = await Effect.runPromise(
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const owner = {
      ...fakeCredentialOwner(),
      verify: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
    }
    const script = scriptedInteraction([{ kind: "confirm", line: "y" }])
    const fiber = yield* Effect.forkChild(runVerification(script.interaction, owner))
    yield* Deferred.await(started)
    yield* TestClock.adjust("15 seconds")
    const result = yield* Fiber.join(fiber)
    assert.equal(result.outcome, "unconfirmed")
    assert.equal(result.attempts, 1)
    assert.equal(script.remaining(), 0)
    return "passed"
  }).pipe(Effect.provide(TestClock.layer()))
)
let captured: Redacted.Redacted<string> | undefined
const brokenOwner = {
  ...fakeCredentialOwner(),
  save: (key: Redacted.Redacted<string>) => {
    captured = key
    return Effect.die(new Error("FAKE_OWNER_ERROR_SENTINEL"))
  }
}
const brokenScript = scriptedInteraction([{ kind: "hidden", value: "FAKE_SECRET_SENTINEL" }])
const failure = await Effect.runPromiseExit(runLogin(brokenScript.interaction, brokenOwner))
assert(Exit.isFailure(failure), "owner defect cannot become cancellation or success")
assert(captured)
assert.throws(() => Redacted.value(captured!))
assert(!brokenScript.transcript.join("").includes("FAKE_SECRET_SENTINEL"))
assert(!brokenScript.transcript.join("").includes("FAKE_OWNER_ERROR_SENTINEL"))
console.log(
  JSON.stringify({ ...scenarios, guards, timeout, ownerFailurePreserved: "passed", capturedWrapperWiped: "passed" })
)
