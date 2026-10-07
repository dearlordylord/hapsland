import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  addEvent,
  makeReviewGitFixture as makeGitFixture,
  put
} from "@hapsland/build-tooling/test-support/test-fixtures"
import {
  evaluatePrepared,
  prepareObservation,
  revalidateEvaluations
} from "@hapsland/review-execution/direct-event/pipeline"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { reviewDecisionModelLayer } from "@hapsland/review-execution/review-providers/live"
import { residentEvaluationIdentity } from "@hapsland/resident-runtime/resident/evaluation-reuse"

const userConfig = () => JSON.stringify({ version: 1, reviewBackend: { provider: "openai", model: "gpt-6-luna" } })
describe("OpenAI review integration", () => {
  it.effect("uses selected transport and invalidates retained advice and reuse after a provider change", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture)
      yield* Effect.promise(() => put(root, "type.ts", "type Count = number"))
      yield* Effect.promise(() => put(root, "user.jsonc", userConfig()))
      const options = { userConfigPath: join(root, "user.jsonc") }
      const settings = yield* loadReviewSettings(root, options)
      const observation = yield* adaptCodexDirectEvent(addEvent(root))
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
              model: "gpt-6-luna",
              answers: body.questions.map((question: { name: string }) => ({
                type: "predicate",
                name: question.name,
                probability: 0.99
              })),
              usage: { input_tokens: 12, output_tokens: 0 }
            })
          )
        )
      })
      const result = yield* evaluatePrepared(outcome.prepared).pipe(
        Effect.provide(reviewDecisionModelLayer(settings, httpClient)),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENAI_API_KEY: "fixture-token" })))
      )
      expect(result.status).toBe("evaluated")
      expect(calls).toBe(1)
      if (result.status !== "evaluated") throw new Error("expected evaluated")
      expect(result.findings.length).toBeGreaterThan(0)
      yield* Effect.promise(() =>
        put(root, "user.jsonc", JSON.stringify({ version: 1, reviewBackend: { provider: "jev" } }))
      )
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
