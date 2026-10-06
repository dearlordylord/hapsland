// THROWAWAY: behavioral checks at the agreed shared interaction seam.
import assert from "node:assert/strict"
import { Effect, Exit, Redacted } from "effect"
import { scriptedInteraction } from "./scripted-interaction.ts"
import type { ChoiceView } from "./interaction.ts"
import { scopeInteraction } from "./interaction-session.ts"
const cancelled = scriptedInteraction([{ kind: "eof" }])
const exit = await Effect.runPromiseExit(cancelled.interaction.hidden("Fake key"))
assert(Exit.isFailure(exit), "hidden EOF must terminate input rather than invent a credential")
assert.equal(cancelled.remaining(), 0)
const captured = scriptedInteraction([{ kind: "hidden", value: "FAKE_SEAM_SENTINEL" }])
const key = await Effect.runPromise(captured.interaction.hidden("Fake key"))
assert.equal(Redacted.value(key), "FAKE_SEAM_SENTINEL")
Redacted.wipeUnsafe(key)
assert(!captured.transcript.join("").includes("FAKE_SEAM_SENTINEL"))
assert.equal(captured.remaining(), 0)
const many = scriptedInteraction([{ kind: "chooseMany", ids: ["second", "first"] }])
assert.deepEqual(
  await Effect.runPromise(
    many.interaction.chooseMany({
      message: "Choose targets",
      back: true,
      choices: [
        { id: "first", title: "Same label", value: 10 },
        { id: "second", title: "Same label", value: 20 }
      ]
    })
  ),
  { kind: "selected", value: [10, 20] },
  "identities, not labels, select values in display order"
)
const pending = scriptedInteraction([{ kind: "choose", index: 0 }])
const released = await Effect.runPromise(Effect.scoped(scopeInteraction(pending.interaction)))
assert(
  Exit.isFailure(
    await Effect.runPromiseExit(
      released.choose({ message: "Closed session", back: false, choices: [{ title: "Choice", value: 1 }] })
    )
  )
)
assert.equal(pending.remaining(), 1, "a closed session cannot consume another input")
const ended = scriptedInteraction([{ kind: "eof" }, { kind: "choose", index: 0 }])
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const interaction = yield* scopeInteraction(ended.interaction)
      yield* interaction.hidden("Fake key").pipe(Effect.catchTag("QuitError", () => Effect.void))
      const resumed = yield* interaction
        .choose({ message: "After EOF", back: false, choices: [{ title: "A", value: 1 }] })
        .pipe(
          Effect.map(() => true),
          Effect.catchTag("QuitError", () => Effect.succeed(false))
        )
      assert.equal(resumed, false, "terminal termination must prevent reopening this input session")
      yield* interaction.present("Cancelled input; no credential was saved.")
    })
  )
)
assert.equal(ended.remaining(), 1, "EOF cannot consume later scripted input")
assert(
  ended.transcript.includes("Cancelled input; no credential was saved."),
  "termination must preserve durable outcome presentation"
)
const queued = scriptedInteraction([{ kind: "eof" }, { kind: "choose", index: 0 }])
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const interaction = yield* scopeInteraction(queued.interaction)
      const completed = yield* Effect.all(
        [
          interaction.hidden("Fake key").pipe(
            Effect.map(() => true),
            Effect.catchTag("QuitError", () => Effect.succeed(false))
          ),
          interaction.choose({ message: "Queued after EOF", back: false, choices: [{ title: "A", value: 1 }] }).pipe(
            Effect.map(() => true),
            Effect.catchTag("QuitError", () => Effect.succeed(false))
          )
        ],
        { concurrency: "unbounded" }
      )
      assert.deepEqual(completed, [false, false])
    })
  )
)
assert.equal(queued.remaining(), 1, "a queued caller cannot reopen terminated input")
const concurrent = scriptedInteraction([
  { kind: "choose", index: 0 },
  { kind: "choose", index: 1 }
])
let active = 0
let overlapping = false
const adapter = {
  ...concurrent.interaction,
  choose: <A>(view: ChoiceView<A>) =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        active++
        overlapping ||= active > 1
      }),
      () => Effect.sleep("5 millis").pipe(Effect.andThen(concurrent.interaction.choose(view))),
      () =>
        Effect.sync(() => {
          active--
        })
    )
}
await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const interaction = yield* scopeInteraction(adapter)
      const choices = {
        message: "Concurrent callers",
        back: false,
        choices: [
          { title: "A", value: "a" },
          { title: "B", value: "b" }
        ]
      }
      const results = yield* Effect.all([interaction.choose(choices), interaction.choose(choices)], {
        concurrency: "unbounded"
      })
      assert.deepEqual(results, [
        { kind: "selected", value: "a" },
        { kind: "selected", value: "b" }
      ])
    })
  )
)
assert.equal(overlapping, false, "one terminal cannot host overlapping prompts")
console.log(
  JSON.stringify({
    hiddenTermination: "passed",
    explicitSyntheticCapture: "passed",
    multipleChoiceIdentity: "passed",
    closedSession: "passed",
    terminalTermination: "passed",
    serializedInput: "passed",
    realCredentialReads: 0
  })
)
