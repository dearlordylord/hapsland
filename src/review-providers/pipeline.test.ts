import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { join } from "node:path"
import { adaptCodexAdd } from "../direct-event/adapter.ts"
import { addEvent, makeReviewGitFixture as makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { evaluatePrepared, prepareObservation, revalidateEvaluations } from "../direct-event/pipeline.ts"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { reviewDecisionModelLayer } from "./live.ts"
import { residentEvaluationIdentity } from "../resident/evaluation-reuse.ts"

const userConfig = (model: "clef" | "clef-flash") =>
  JSON.stringify({ version: 1, reviewBackend: { provider: "cloudflare", model, accountId: "a".repeat(32) } })
describe("Cloudflare review integration", () => {
  it.effect("rejects 65 selected questions before dispatch authority or model execution", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type Count = number"))
      yield* Effect.promise(() => put(root, "user.jsonc", userConfig("clef")))
      const settings = yield* loadReviewSettings(root, { userConfigPath: join(root, "user.jsonc") })
      const observation = yield* adaptCodexAdd(addEvent(root))
      if (observation === undefined) throw new Error("missing observation")
      const prepared = yield* prepareObservation(observation, {
        controlledWriter: true,
        advicee: observation.advicee,
        settings
      })
      const outcome = prepared.outcomes.find((entry) => entry.status === "ready")
      if (outcome?.status !== "ready") throw new Error("missing prepared unit")
      const rule = outcome.prepared.input.rules[0]
      if (rule === undefined) throw new Error("missing rule")
      const oversized = {
        ...outcome.prepared,
        input: {
          ...outcome.prepared.input,
          rules: Array.from({ length: 65 }, (_, index) => ({ ...rule, id: `rule-${index}` }))
        }
      }
      let dispatches = 0
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({})))
      })
      const result = yield* evaluatePrepared(
        oversized,
        Effect.sync(() => {
          dispatches++
        })
      ).pipe(
        Effect.provide(reviewDecisionModelLayer(settings, httpClient)),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "fixture-token" })))
      )
      expect(result.status).toBe("input-limit")
      expect(dispatches).toBe(0)
      expect(calls).toBe(0)
    })
  )

  it.effect("uses selected transport and invalidates retained advice and reuse after a model change", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type Count = number"))
      yield* Effect.promise(() => put(root, "user.jsonc", userConfig("clef")))
      const options = { userConfigPath: join(root, "user.jsonc") }
      const settings = yield* loadReviewSettings(root, options)
      const observation = yield* adaptCodexAdd(addEvent(root))
      if (observation === undefined) throw new Error("missing observation")
      const context = { controlledWriter: true, advicee: observation.advicee, settings } as const
      const prepared = yield* prepareObservation(observation, context)
      const outcome = prepared.outcomes.find((entry) => entry.status === "ready")
      if (outcome?.status !== "ready") throw new Error("missing prepared unit")
      expect(outcome.prepared.input.providerIdentity).toEqual(settings.providerIdentity)
      let calls = 0
      const httpClient = HttpClient.make((request) => {
        calls++
        expect(request.url).toBe(settings.destination)
        const body =
          request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              success: true,
              errors: [],
              result: {
                model: "clef",
                answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.99 }]))
              }
            })
          )
        )
      })
      const result = yield* evaluatePrepared(outcome.prepared).pipe(
        Effect.provide(reviewDecisionModelLayer(settings, httpClient)),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "fixture-token" })))
      )
      expect(result.status).toBe("evaluated")
      expect(calls).toBe(1)
      if (result.status !== "evaluated") throw new Error("expected evaluated")
      expect(result.findings.length).toBeGreaterThan(0)
      yield* Effect.promise(() => put(root, "user.jsonc", userConfig("clef-flash")))
      const changed = yield* loadReviewSettings(root, options)
      const nextContext = { ...context, settings: changed }
      const next = yield* prepareObservation(observation, nextContext)
      const nextOutcome = next.outcomes.find((entry) => entry.status === "ready")
      if (nextOutcome?.status !== "ready") throw new Error("missing changed prepared unit")
      expect(residentEvaluationIdentity("partition", nextOutcome.prepared)).not.toBe(
        residentEvaluationIdentity("partition", outcome.prepared)
      )
      const revalidated = yield* revalidateEvaluations(
        observation,
        [{ prepared: outcome.prepared, findings: result.findings }],
        nextContext,
        { isCurrentWork: () => Effect.succeed(true) }
      )
      expect(revalidated.status).toBe("stale")
      expect(revalidated.findings).toEqual([])
    })
  )
})
