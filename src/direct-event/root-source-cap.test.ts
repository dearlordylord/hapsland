import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { resolveConfiguration, effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve"
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import "@hapsland/review-execution/policy/rules"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { controlledDecisionModelLayer } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  measuredRootSourceDecision,
  prepareObservation,
  reviewObservation
} from "@hapsland/review-execution/direct-event/pipeline"
import { addEvent, makeGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"

const rules = [
  {
    id: "type",
    question: "Is the type clear?",
    criteria: { false: "No", true: "Yes" },
    message: "Review type",
    inputs: [{ languages: ["typescript", "rust", "bend"], kind: "type", requires: ["root-declaration"] }]
  },
  {
    id: "function",
    question: "Is the function clear?",
    criteria: { false: "No", true: "Yes" },
    message: "Review function",
    inputs: [{ languages: ["typescript"], kind: "function", requires: ["signature", "body"] }]
  }
].map((rule) => compileRule({ version: 1, ...rule }, "fixture:root-cap"))

describe("configured root source cap", () => {
  for (const branch of [
    { contract: TYPE_INPUT_CONTRACT, declaration: "export interface A { value: string }" },
    { contract: FUNCTION_INPUT_CONTRACT, declaration: "export function A(): number { return 1 }" }
  ] as const) {
    it.effect(`lets Bend reject measured ${branch.contract} root bytes before parsing`, () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(makeGitFixture)
        const source = `// ${"x".repeat(100)}\n${branch.declaration}\n`
        const measuredBytes = Buffer.byteLength(source, "utf8")
        expect(measuredBytes).toBeGreaterThan(80)
        yield* Effect.promise(() => put(root, "a.ts", source))
        const observation = yield* adaptCodexDirectEvent(addEvent(root, ["a.ts"]))
        if (observation === undefined) throw new Error("fixture adaptation failed")
        const configuration = {
          policy: resolveConfiguration(
            [
              {
                name: "user",
                source: "fixture:root-cap",
                document: { version: 1, graphLimits: { version: 1, sourceBytes: 80, readBytes: 80 } }
              }
            ],
            root
          )
        }
        const limits = effectiveGraphLimits(configuration.policy)
        expect(measuredRootSourceDecision(measuredBytes, limits)).toEqual({
          kind: "unitIncomplete",
          reason: "ReadLimit"
        })
        let preflightCalls = 0
        const reads: string[] = []
        const context = {
          controlledWriter: true,
          advicee: observation.advicee,
          inputContract: branch.contract,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION, configuration },
          rules,
          allowCandidateCrossFileEgress: true,
          captureHooks: {
            sourceRead: (path: string) => {
              reads.push(path)
            }
          },
          beforeAnalyze: () =>
            Effect.sync(() => {
              preflightCalls += 1
              return true
            })
        } as const
        const prepared = yield* prepareObservation(observation, context)
        expect(reads).toEqual([])
        expect(preflightCalls).toBe(0)
        expect(prepared.outcomes).toEqual([{ status: "skipped", path: "a.ts" }])
        expect(prepared.observation.outcomes).toMatchObject([
          { status: "incomplete", path: "a.ts", reason: "capture-unavailable" }
        ])
        let providerCalls = 0
        const reviewed = yield* reviewObservation(observation, context).pipe(
          Effect.provide(
            controlledDecisionModelLayer({
              onRequest: Effect.sync(() => {
                providerCalls += 1
              })
            })
          )
        )
        expect(reviewed.status).toBe("no-advice")
        expect(providerCalls).toBe(0)
        expect(preflightCalls).toBe(0)
      })
    )
  }
})
