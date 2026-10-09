import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import * as Tracer from "effect/Tracer"
import { InspectionTransportObservation } from "@hapsland/inspection-records/inspection/transport"
import { Decision, DecisionModel } from "effect/ai"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { decide } from "@hapsland/review-execution/jev-decision"
import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"
import { liveLayer } from "@hapsland/review-execution/review-providers/openai"
import { encodedProviderHttpBodyBytes } from "@hapsland/review-execution/direct-event/provider-body-size"

const decision = Decision.probability({
  instructions: "Is the type invalid?",
  criteria: { false: "All states have meaning", true: "An invalid state is representable" }
})
const tokenLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENAI_API_KEY: "SECRET-SENTINEL" }))
const identity = () => providerIdentity({ provider: "openai", model: "gpt-6-luna" })
const envelope = (answers: unknown = [{ type: "predicate", name: "q0", probability: 0.91 }]) => ({
  model: "gpt-6-luna",
  answers,
  usage: { input_tokens: 12, output_tokens: 0 }
})

describe("OpenAI Decisions wire contract", () => {
  it.effect("preserves shared JSON evidence, criteria, qualified IDs and exact byte accounting", () =>
    Effect.gen(function* () {
      const requests: Array<{ url: string; auth: string | undefined; body: string }> = []
      const httpClient = HttpClient.make((request) => {
        expect(Object.keys(request.headers).sort()).toEqual([
          "accept",
          "authorization",
          "content-length",
          "content-type"
        ])
        const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
        requests.push({ url: request.url, auth: request.headers.authorization, body })
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              envelope([
                { type: "predicate", name: "q1", probability: 0 },
                { type: "predicate", name: "q0", probability: 0.91 }
              ])
            )
          )
        )
      })
      const state = { artifact: { source: 'SOURCE-SENTINEL 日本語 "quoted"', domain: "src/type.ts" } }
      const plain = Decision.probability({ instructions: "Another question?" })
      const result = yield* decide({ state, decisions: { "namespace/rule": decision, other: plain } }).pipe(
        Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
        Effect.provide(tokenLayer),
        Effect.provideService(InspectionTransportObservation, {
          observe: (bytes) => {
            if (bytes !== undefined) bytes.fill(0)
          }
        }),
        Effect.withParentSpan(Tracer.externalSpan({ traceId: "PRIVATE_CONVERSATION", spanId: "PRIVATE_PARENT" }))
      )
      expect(result.answers["namespace/rule"].probability).toBe(0.91)
      expect(result.answers.other.probability).toBe(0)
      expect(result.usage.inputTokens).toBe(12)
      expect(requests).toHaveLength(1)
      const request = requests[0]
      if (request === undefined) throw new Error("missing request")
      expect(request.url).toBe("https://api.openai.com/v1/decisions")
      expect(request.auth).toBe("Bearer SECRET-SENTINEL")
      expect(JSON.parse(request.body)).toEqual({
        model: "gpt-6-luna",
        input: JSON.stringify(state),
        questions: [
          {
            type: "predicate",
            name: "q0",
            instructions: `${decision.instructions}\n\nOutcome criteria (JSON): ${JSON.stringify(decision.criteria)}`
          },
          { type: "predicate", name: "q1", instructions: plain.instructions }
        ]
      })
      expect(request.body).not.toContain("SECRET-SENTINEL")
      expect(request.body).not.toContain("PRIVATE_CONVERSATION")
      expect(Buffer.byteLength(request.body)).toBe(
        encodedProviderHttpBodyBytes(
          state,
          [
            { id: "namespace/rule", decision },
            { id: "other", decision: plain }
          ],
          "gpt-6-luna"
        )
      )
    })
  )

  for (const [name, payload, status] of [
    ["HTTP failure", envelope(), 429],
    ["wrong model", { ...envelope(), model: "other" }, 200],
    ["missing answer", envelope([]), 200],
    [
      "extra answer",
      envelope([
        { type: "predicate", name: "q0", probability: 0.5 },
        { type: "predicate", name: "q1", probability: 0.5 }
      ]),
      200
    ],
    ["unknown name", envelope([{ type: "predicate", name: "other", probability: 0.5 }]), 200],
    ["null name", envelope([{ type: "predicate", name: null, probability: 0.5 }]), 200],
    ["invalid probability", envelope([{ type: "predicate", name: "q0", probability: 1.1 }]), 200],
    ["wrong answer kind", envelope([{ type: "choice", name: "q0", choice: "yes" }]), 200],
    ["refusal", envelope([{ type: "refusal", name: "q0", reason: "SOURCE-SENTINEL SECRET-SENTINEL" }]), 200],
    ["invalid usage", { ...envelope(), usage: { input_tokens: -1, output_tokens: 0 } }, 200]
  ] as const) {
    it.effect(`rejects ${name} without retries or sensitive error contents`, () =>
      Effect.gen(function* () {
        let calls = 0
        const httpClient = HttpClient.make((request) => {
          calls++
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(payload, { status })))
        })
        const result = yield* decide({ state: "SOURCE-SENTINEL", decisions: { rule: decision } }).pipe(
          Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
          Effect.provide(tokenLayer),
          Effect.result
        )
        expect(result._tag).toBe("Failure")
        expect(calls).toBe(1)
        expect(JSON.stringify(result)).not.toContain("SECRET-SENTINEL")
        expect(JSON.stringify(result)).not.toContain("SOURCE-SENTINEL")
      })
    )
  }

  it.effect("rejects duplicate names even when the answer count matches", () =>
    Effect.gen(function* () {
      const httpClient = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              envelope([
                { type: "predicate", name: "q0", probability: 0.5 },
                { type: "predicate", name: "q0", probability: 0.5 }
              ])
            )
          )
        )
      )
      const result = yield* decide({ state: {}, decisions: { first: decision, second: decision } }).pipe(
        Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
        Effect.provide(tokenLayer),
        Effect.result
      )
      expect(result._tag).toBe("Failure")
    })
  )

  it.effect("rejects an alternate destination before HTTP", () =>
    Effect.gen(function* () {
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope())))
      })
      const result = yield* decide({ state: {}, decisions: { rule: decision } }).pipe(
        Effect.provide(
          liveLayer({
            identity: { ...identity(), destination: "https://other.invalid" },
            credentialEnvVar: "OPENAI_API_KEY",
            httpClient
          })
        ),
        Effect.provide(tokenLayer),
        Effect.result
      )
      expect(result._tag).toBe("Failure")
      expect(calls).toBe(0)
    })
  )
  it.effect("rejects every non-OpenAI identity field before HTTP", () =>
    Effect.gen(function* () {
      for (const invalidIdentity of [
        { ...identity(), provider: "cloudflare" as const },
        { ...identity(), model: "clef" as const }
      ]) {
        let calls = 0
        const httpClient = HttpClient.make((request) => {
          calls++
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope())))
        })
        const result = yield* decide({ state: {}, decisions: { rule: decision } }).pipe(
          Effect.provide(liveLayer({ identity: invalidIdentity, credentialEnvVar: "OPENAI_API_KEY", httpClient })),
          Effect.provide(tokenLayer),
          Effect.result
        )
        expect(result._tag).toBe("Failure")
        expect(calls).toBe(0)
      }
    })
  )

  it.effect("rejects an over-limit question before HTTP", () =>
    Effect.gen(function* () {
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope())))
      })
      const tooLong = Decision.probability({ instructions: "x".repeat(1_048_577) })
      const result = yield* decide({ state: {}, decisions: { rule: tooLong } }).pipe(
        Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
        Effect.provide(tokenLayer),
        Effect.result
      )
      expect(result._tag).toBe("Failure")
      expect(calls).toBe(0)
    })
  )

  it.effect("rejects non-probability decisions before HTTP", () =>
    Effect.gen(function* () {
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope())))
      })
      const result = yield* Effect.gen(function* () {
        const model = yield* DecisionModel.DecisionModel
        return yield* model.decide(
          Decision.make({
            input: Schema.Json,
            decisions: { rule: Decision.classify({ instructions: "Choose", criteria: { yes: "Yes", no: "No" } }) }
          }),
          { input: {} }
        )
      }).pipe(
        Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
        Effect.provide(tokenLayer),
        Effect.result
      )
      expect(result._tag).toBe("Failure")
      expect(calls).toBe(0)
    })
  )

  for (const mode of ["interrupt", "deadline"] as const) {
    it.effect(`preserves ${mode} and finalizes in-flight HTTP without retries`, () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const stopped = yield* Deferred.make<void>()
        let calls = 0
        const httpClient = HttpClient.make(() => {
          calls++
          return Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(stopped, undefined))
          )
        })
        const request = decide({ state: {}, decisions: { rule: decision } }).pipe(
          Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })),
          Effect.provide(tokenLayer)
        )
        const fiber = yield* (mode === "deadline" ? request.pipe(Effect.timeout("1 second")) : request).pipe(
          Effect.forkChild
        )
        yield* Deferred.await(started)
        if (mode === "deadline") yield* TestClock.adjust("1 second")
        else yield* Fiber.interrupt(fiber)
        yield* Deferred.await(stopped)
        const exit = yield* Fiber.await(fiber)
        expect(exit._tag).toBe("Failure")
        expect(calls).toBe(1)
      })
    )
  }

  it.effect("enforces rendered instruction limits, including appended criteria, before HTTP", () =>
    Effect.gen(function* () {
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope())))
      })
      const layer = liveLayer({ identity: identity(), credentialEnvVar: "OPENAI_API_KEY", httpClient })
      const atLimit = Decision.probability({ instructions: "x".repeat(1_048_576) })
      const accepted = yield* decide({ state: {}, decisions: { rule: atLimit } }).pipe(
        Effect.provide(layer),
        Effect.provide(tokenLayer)
      )
      expect(accepted.answers.rule.probability).toBe(0.91)
      for (const rule of [
        Decision.probability({ instructions: atLimit.instructions + "x" }),
        Decision.probability({ instructions: atLimit.instructions, criteria: { false: "No", true: "Yes" } })
      ]) {
        const result = yield* decide({ state: {}, decisions: { rule } }).pipe(
          Effect.provide(layer),
          Effect.provide(tokenLayer),
          Effect.result
        )
        expect(result._tag).toBe("Failure")
      }
      expect(calls).toBe(1)
    })
  )
})
