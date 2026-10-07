import { expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as TestClock from "effect/testing/TestClock"
import { makeInitialCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { CredentialLifecycleResult } from "@hapsland/credential-storage/credentials/owner"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import {
  runVerificationConversation,
  VerificationOwnerService,
  type VerificationOwner,
  type VerificationTransition
} from "@hapsland/administration/onboarding/verification-conversation"
import { reduceVerification, type KeyVerification } from "@hapsland/administration/onboarding/verification-model"
import { scriptedInteraction, type ScriptStep } from "../../scripts/test-support/scripted-interaction.ts"
import * as Fiber from "effect/Fiber"
import { verifyJevKey, MAX_KEY_CHECKS } from "@hapsland/administration/onboarding/credential-verification"

it.effect.each([
  [200, "accepted"],
  [401, "rejected"],
  [403, "forbidden"],
  [429, "rate-limited"],
  [402, "unconfirmed"],
  [500, "unconfirmed"]
] as const)("checks one synthetic request and sanitizes HTTP %s", ([status, expected]) =>
  Effect.gen(function* () {
    const requests: string[] = []
    const client = HttpClient.make((request) => {
      expect(request.headers.authorization).toBe("Bearer private-key")
      expect(request.url).toBe("https://api.typesafe.ai/v1/systemone")
      const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      requests.push(body)
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify(
              status === 200
                ? {
                    model: "jev-latest",
                    answers: { greeting: { type: "noul", noul: 0.8 } },
                    usage: { input_tokens: 10, output_tokens: 1 }
                  }
                : { message: "private-key and provider-private-body" }
            ),
            { status, headers: { "content-type": "application/json" } }
          )
        )
      )
    })
    const result = yield* verifyJevKey(Redacted.make("private-key"), client)
    expect(result).toBe(expected)
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0] ?? "").state).toBe("Hapsland connection check: hello.")
    expect(requests[0]).not.toContain("private-key")
  })
)

it.effect("bounds a hung request without retrying", () =>
  Effect.gen(function* () {
    let calls = 0
    const client = HttpClient.make(() => {
      calls++
      return Effect.never
    })
    const fiber = yield* verifyJevKey(Redacted.make("private-key"), client).pipe(Effect.forkChild)
    yield* TestClock.adjust("15 seconds")
    expect(yield* Fiber.join(fiber)).toBe("unconfirmed")
    expect(calls).toBe(1)
  })
)

it.effect("does not treat a malformed success response as a verified key", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("private provider body", { status: 200, headers: { "content-type": "application/json" } })
        )
      )
    )
    expect(yield* verifyJevKey(Redacted.make("private-key"), client)).toBe("unconfirmed")
  })
)

// Workflow decisions use the same input seam as the terminal, with isolated owners.
const fixture = (options: {
  steps: ScriptStep[]
  source?: "saved" | "file" | "environment"
  results?: KeyVerification[]
  provider?: "jev" | "cloudflare" | "openai"
  missing?: boolean
  storage?: CredentialLifecycleResult["status"]
}) => {
  const script = scriptedInteraction(options.steps)
  const calls: string[] = []
  const transitions: VerificationTransition[] = []
  const wrappers: Redacted.Redacted<string>[] = []
  const results = [...(options.results ?? ["accepted"])]
  let value = "private-original-key"
  const owner: VerificationOwner = {
    read: Effect.sync(() => {
      calls.push("read")
      return {
        provider: options.provider ?? "jev",
        guidance: [],
        credential: options.missing
          ? { status: "missing" as const, source: "saved" as const, generation: 0 }
          : {
              status: "present" as const,
              source:
                options.source === "saved" || options.source === undefined
                  ? ("saved" as const)
                  : ("environment" as const),
              value,
              generation: 1,
              ...(options.source === "file" ? { file: "/controlled/.env" } : {})
            }
      }
    }),
    save: (key) =>
      Effect.sync(() => {
        calls.push("save")
        value = key
        return {
          status: options.storage ?? "stored",
          state: { ...makeInitialCredentialState(), generation: 2 },
          stateLock: "acquired" as const
        }
      }),
    verify: (key) =>
      Effect.sync(() => {
        calls.push("verify")
        expect(Redacted.value(key)).toBe(value)
        wrappers.push(key)
        return results.shift() ?? "rejected"
      })
  }
  const run = runVerificationConversation({
    observe: (transition) =>
      Effect.sync(() => {
        transitions.push(transition)
      })
  }).pipe(
    Effect.provideService(InteractionService, script.interaction),
    Effect.provideService(VerificationOwnerService, owner),
    Effect.map((outcome) => outcome.model)
  )
  return { script, calls, transitions, wrappers, owner, run }
}
it.effect.each(["decline", "cloudflare", "openai", "missing", "accept"] as const)(
  "offers verification safely: %s",
  (scenario) =>
    Effect.gen(function* () {
      const f = fixture({
        steps:
          scenario === "missing" || scenario === "cloudflare" || scenario === "openai"
            ? []
            : [{ kind: "confirm", line: scenario === "accept" ? " Y " : "yes" }],
        provider: scenario === "cloudflare" || scenario === "openai" ? scenario : "jev",
        missing: scenario === "missing"
      })
      const model = yield* f.run
      expect(f.calls.filter((call) => call === "verify")).toHaveLength(scenario === "accept" ? 1 : 0)
      expect(f.script.remaining()).toBe(0)
      expect(JSON.stringify({ model, transitions: f.transitions, output: f.script.transcript })).not.toContain(
        "private-original-key"
      )
      expect(f.script.transcript.join("")).toContain(scenario === "accept" ? "Key verified" : "not checked")
      for (const key of f.wrappers) expect(() => Redacted.value(key)).toThrow()
    })
)
it.effect.each(["rate-limited", "unconfirmed"] as const)("keeps the key and only warns on %s", (result) =>
  Effect.gen(function* () {
    const f = fixture({ steps: [{ kind: "confirm", line: "y" }], results: [result] })
    yield* f.run
    expect(f.calls).toEqual(["read", "verify"])
    expect(f.script.transcript.join("")).toContain("kept for review")
    expect(f.script.transcript.join("")).not.toMatch(/rerun|retry|restart/i)
  })
)
const replace: ScriptStep[] = [
  { kind: "choose", index: 0 },
  { kind: "confirm", line: "y" },
  { kind: "hidden", value: "private-replacement-key" }
]
it.effect("replacement and a new paid request each require their own consent", () =>
  Effect.gen(function* () {
    const f = fixture({
      steps: [{ kind: "confirm", line: "y" }, ...replace, { kind: "confirm", line: "y" }],
      results: ["rejected", "accepted"]
    })
    const model = yield* f.run
    expect(f.calls).toEqual(["read", "verify", "save", "read", "verify"])
    expect(model.observations.map((item) => item.result)).toEqual(["rejected", "accepted"])
    expect(model.storage).toEqual({ status: "stored", generation: 2 })
    expect(f.transitions.filter((t) => t.event.action.kind === "approve")).toHaveLength(2)
    expect(JSON.stringify({ model, transitions: f.transitions, output: f.script.transcript })).not.toMatch(
      /private-original-key|private-replacement-key/
    )
    expect(f.script.remaining()).toBe(0)
  })
)
it.effect("saving a replacement never implicitly authorizes its verification", () =>
  Effect.gen(function* () {
    const f = fixture({
      steps: [{ kind: "confirm", line: "y" }, ...replace, { kind: "confirm", line: "n" }],
      results: ["rejected"]
    })
    const model = yield* f.run
    expect(f.calls).toEqual(["read", "verify", "save", "read"])
    expect(model.attempts).toBe(1)
    expect(model.storage?.status).toBe("stored")
  })
)
it.effect.each(["saved", "file"] as const)("bounds %s rechecks to three fresh approvals", (source) =>
  Effect.gen(function* () {
    const f = fixture({
      source,
      steps: [
        { kind: "confirm", line: "y" },
        ...[0, 1].flatMap((): ScriptStep[] => [
          { kind: "choose", index: source === "saved" ? 1 : 0 },
          { kind: "confirm", line: "y" }
        ])
      ],
      results: ["rejected", "forbidden", "rejected"]
    })
    const model = yield* f.run
    expect(model.attempts).toBe(MAX_KEY_CHECKS)
    expect(f.calls.filter((call) => call === "verify")).toHaveLength(MAX_KEY_CHECKS)
    expect(f.calls).not.toContain("save")
    expect(f.transitions.filter((t) => t.event.action.kind === "approve")).toHaveLength(3)
    expect(f.script.remaining()).toBe(0)
  })
)
it.effect("environment rejection gives guidance without replacement or retries", () =>
  Effect.gen(function* () {
    const f = fixture({ source: "environment", steps: [{ kind: "confirm", line: "y" }], results: ["rejected"] })
    yield* f.run
    expect(f.calls).toEqual(["read", "verify"])
    expect(f.script.transcript.join("")).toContain("Saved login does not override")
  })
)
it.effect.each(["busy", "indeterminate"] as const)("preserves %s replacement without another request", (storage) =>
  Effect.gen(function* () {
    const f = fixture({ storage, steps: [{ kind: "confirm", line: "y" }, ...replace], results: ["rejected"] })
    const model = yield* f.run
    expect(model.storage?.status).toBe(storage)
    expect(model.observations[0]?.result).toBe("rejected")
    expect(f.calls).toEqual(["read", "verify", "save"])
  })
)
it.effect.each(["exit", "eof"] as const)(
  "hidden %s ends replacement without saving or losing earlier results",
  (kind) =>
    Effect.gen(function* () {
      const f = fixture({
        steps: [{ kind: "confirm", line: "y" }, { kind: "choose", index: 0 }, { kind: "confirm", line: "y" }, { kind }],
        results: ["rejected"]
      })
      const model = yield* f.run
      expect(model.phase).toBe("Cancelled")
      expect(model.observations[0]?.result).toBe("rejected")
      expect(f.calls).toEqual(["read", "verify"])
    })
)
it.effect("Back and Exit retain a saved replacement and the previous verification", () =>
  Effect.gen(function* () {
    const f = fixture({
      steps: [{ kind: "confirm", line: "y" }, ...replace, { kind: "back" }, { kind: "exit" }],
      results: ["rejected"]
    })
    const model = yield* f.run
    expect(model.phase).toBe("Cancelled")
    expect(model.storage?.status).toBe("stored")
    expect(model.observations[0]?.result).toBe("rejected")
    expect(f.calls.filter((call) => call === "verify")).toHaveLength(1)
  })
)
it.effect("rejects stale consent, changed credential revisions and repeated completion", () =>
  Effect.gen(function* () {
    const f = fixture({ steps: [{ kind: "confirm", line: "y" }] })
    yield* f.run
    const approval = f.transitions.find((t) => t.event.action.kind === "approve")!
    expect(reduceVerification(approval.before, { ...approval.event, revision: approval.event.revision - 1 })).toBe(
      approval.before
    )
    expect(
      reduceVerification(approval.before, {
        revision: approval.before.revision,
        action: { kind: "approve", yes: true, keyRevision: approval.before.keyRevision + 1 }
      })
    ).toBe(approval.before)
    const observed = f.transitions.find((t) => t.event.action.kind === "observed")!
    expect(reduceVerification(observed.after, observed.event)).toBe(observed.after)
  })
)

it.effect("invalid hidden input fails without being reported as cancellation", () =>
  Effect.gen(function* () {
    const f = fixture({
      steps: [
        { kind: "confirm", line: "y" },
        { kind: "choose", index: 0 },
        { kind: "confirm", line: "y" },
        { kind: "hidden", value: "x".repeat(32769) }
      ],
      results: ["rejected"]
    })
    expect(yield* f.run.pipe(Effect.result)).toMatchObject({ _tag: "Failure", failure: { reason: "invalid" } })
    expect(f.calls).toEqual(["read", "verify"])
    expect(f.script.transcript.join("")).not.toContain("Key entry cancelled")
  })
)
it.effect("Back from replacement consent requests no key and preserves the rejected observation", () =>
  Effect.gen(function* () {
    const f = fixture({
      steps: [{ kind: "confirm", line: "y" }, { kind: "choose", index: 0 }, { kind: "back" }, { kind: "exit" }],
      results: ["rejected"]
    })
    const model = yield* f.run
    expect(model.phase).toBe("Cancelled")
    expect(model.observations[0]?.result).toBe("rejected")
    expect(f.calls).toEqual(["read", "verify"])
    expect(f.script.remaining()).toBe(0)
  })
)
