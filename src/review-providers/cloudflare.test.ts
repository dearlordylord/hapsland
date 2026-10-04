import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import { Decision } from "effect/ai"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { decide } from "../jev-decision.ts"
import { providerIdentity } from "./catalog.ts"
import { liveLayer } from "./cloudflare.ts"
import { encodedProviderHttpBodyBytes } from "../direct-event/provider-body-size.ts"

const decision = Decision.probability({
  instructions: "Is the type invalid?",
  criteria: { false: "All states have meaning", true: "An invalid state is representable" }
})
const tokenLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "SECRET-SENTINEL" }))
const identity = (model: "clef" | "clef-flash" = "clef") =>
  providerIdentity({ provider: "cloudflare", model, accountId: "a".repeat(32) })
const envelope = (model = "clef", answers: unknown = { q0: { type: "noul", noul: 0.91 } }) => ({
  success: true,
  errors: [],
  result: { model, answers, usage: { input_tokens: 12, output_tokens: 0 } }
})

describe("Cloudflare DecisionModel wire contract", () => {
  for (const model of ["clef", "clef-flash"] as const) {
    it.effect(`sends ${model}, preserves criteria and reverses qualified rule IDs`, () =>
      Effect.gen(function* () {
        const requests: Array<{ url: string; auth: string | undefined; body: string }> = []
        const httpClient = HttpClient.make((request) => {
          const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
          requests.push({ url: request.url, auth: request.headers.authorization, body })
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(envelope(model))))
        })
        const state = { artifact: { source: "SOURCE-SENTINEL", domain: "src/type.ts" } }
        const result = yield* decide({ state, decisions: { "team/rule": decision } }).pipe(
          Effect.provide(
            liveLayer({ identity: identity(model), credentialEnvVar: "CLOUDFLARE_API_TOKEN", httpClient })
          ),
          Effect.provide(tokenLayer)
        )
        expect(result.answers["team/rule"].probability).toBe(0.91)
        expect(result.usage.inputTokens).toBe(12)
        expect(requests).toHaveLength(1)
        const request = requests[0]
        if (request === undefined) throw new Error("missing request")
        expect(request.url).toBe(identity(model).destination)
        expect(request.auth).toBe("Bearer SECRET-SENTINEL")
        expect(JSON.parse(request.body)).toEqual({
          model,
          state,
          questions: { q0: { type: "noul", instructions: decision.instructions, criteria: decision.criteria } }
        })
        expect(request.body).not.toContain("SECRET-SENTINEL")
        expect(Buffer.byteLength(request.body)).toBe(
          encodedProviderHttpBodyBytes(state, [{ id: "team/rule", decision }], model)
        )
      })
    )
  }

  for (const [name, payload, status] of [
    ["HTTP failure", envelope(), 429],
    ["unsuccessful envelope", { ...envelope(), success: false }, 200],
    ["provider errors", { ...envelope(), errors: [{ message: "SOURCE-SENTINEL SECRET-SENTINEL" }] }, 200],
    ["missing answer", envelope("clef", {}), 200],
    ["extra answer", envelope("clef", { q0: { type: "noul", noul: 0.5 }, q1: { type: "noul", noul: 0.5 } }), 200],
    ["wrong model", envelope("clef-flash"), 200],
    ["invalid probability", envelope("clef", { q0: { type: "noul", noul: 1.1 } }), 200],
    ["wrong answer kind", envelope("clef", { q0: { type: "choice", choice: "yes" } }), 200]
  ] as const) {
    it.effect(`rejects ${name} without retries or sensitive error contents`, () =>
      Effect.gen(function* () {
        let calls = 0
        const httpClient = HttpClient.make((request) => {
          calls++
          return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(payload, { status })))
        })
        const result = yield* decide({ state: "SOURCE-SENTINEL", decisions: { rule: decision } }).pipe(
          Effect.provide(liveLayer({ identity: identity(), credentialEnvVar: "CLOUDFLARE_API_TOKEN", httpClient })),
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

  it.effect("accepts 64 questions and rejects 65 before HTTP", () =>
    Effect.gen(function* () {
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json(
              envelope(
                "clef",
                Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`q${i}`, { type: "noul", noul: 0.5 }]))
              )
            )
          )
        )
      })
      const layer = liveLayer({ identity: identity(), credentialEnvVar: "CLOUDFLARE_API_TOKEN", httpClient })
      const rules = (length: number) => Object.fromEntries(Array.from({ length }, (_, i) => [`pack/r${i}`, decision]))
      const accepted = yield* decide({ state: {}, decisions: rules(64) }).pipe(
        Effect.provide(layer),
        Effect.provide(tokenLayer)
      )
      expect(Object.keys(accepted.answers)).toHaveLength(64)
      const rejected = yield* decide({ state: {}, decisions: rules(65) }).pipe(
        Effect.provide(layer),
        Effect.provide(tokenLayer),
        Effect.result
      )
      expect(rejected._tag).toBe("Failure")
      expect(calls).toBe(1)
    })
  )
})
