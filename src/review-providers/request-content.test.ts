import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { reviewHttpTransport } from "@hapsland/review-execution/review-providers/transport"
import { reviewRequestContent } from "@hapsland/review-execution/review-providers/request-content"
import { InspectionTransportObservation } from "@hapsland/inspection-records/inspection/transport"

const bytes = (input: unknown) => new TextEncoder().encode(JSON.stringify(input))

describe("production Bend request-content boundary", () => {
  it.effect("drops extra top-level fields at the actual shared transport", () =>
    Effect.gen(function* () {
      const sent: string[] = []
      const observed: string[] = []
      const transport = reviewHttpTransport(
        HttpClient.make((request) => {
          expect(request.body._tag).toBe("Uint8Array")
          if (request.body._tag === "Uint8Array") sent.push(new TextDecoder().decode(request.body.body))
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}")))
        })
      )
      const allowed = {
        model: "jev-latest",
        state: { code: "日本語🦊", prompt: "allowed source field" },
        questions: { rule: { type: "noul", instructions: "Check" } }
      }
      for (const input of [
        { prompt: "SECRET", ...allowed, transcript: "SECRET" },
        {
          questions: allowed.questions,
          "model ": "SECRET",
          state: allowed.state,
          model: allowed.model,
          inspection: { private: "SECRET" }
        }
      ]) {
        yield* transport
          .execute(
            HttpClientRequest.post("https://offline.invalid").pipe(
              HttpClientRequest.bodyText(JSON.stringify(input), "application/json")
            )
          )
          .pipe(
            Effect.provideService(InspectionTransportObservation, {
              observe: (body) => {
                observed.push(new TextDecoder().decode(body))
              }
            })
          )
      }
      expect(sent).toEqual([JSON.stringify(allowed), JSON.stringify(allowed)])
      expect(observed).toEqual(sent)
    })
  )

  it("preserves JSON values and exact allowed names", () => {
    for (const value of [null, false, 0, "", 'quote"\\\n\u0000🦊', [], {}, [1, { prompt: "inside approved value" }]]) {
      const allowed = { model: value, state: value, questions: value }
      expect(reviewRequestContent(bytes({ secret: "PRIVATE", Model: "PRIVATE", ...allowed }))).toBe(
        JSON.stringify(allowed)
      )
    }
    expect(reviewRequestContent(bytes({ prompt: "SECRET" }))).toBe('{"model":null,"state":null,"questions":null}')
  })

  it("handles large source and many discarded fields without recursive JS stack growth", () => {
    const allowed = { model: "jev-latest", state: "x".repeat(3_000_000), questions: {} }
    const extras = Object.fromEntries(Array.from({ length: 20_000 }, (_, index) => [`private-${index}`, "SECRET"]))
    expect(reviewRequestContent(bytes({ ...extras, ...allowed }))).toBe(JSON.stringify(allowed))
  })

  it.effect("rejects nonconcrete and nonobject bodies before transport", () =>
    Effect.gen(function* () {
      let calls = 0
      const transport = reviewHttpTransport(
        HttpClient.make((request) => {
          calls++
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}")))
        })
      )
      for (const request of [
        HttpClientRequest.post("https://offline.invalid"),
        HttpClientRequest.post("https://offline.invalid").pipe(HttpClientRequest.bodyText("[]"))
      ]) {
        const exit = yield* Effect.exit(transport.execute(request))
        expect(exit._tag).toBe("Failure")
      }
      expect(calls).toBe(0)
    })
  )
  it.effect("OpenAI profile selects only model/input/questions at the real transport", () =>
    Effect.gen(function* () {
      const sent: string[] = []
      const transport = reviewHttpTransport(
        HttpClient.make((request) => {
          if (request.body._tag === "Uint8Array") sent.push(new TextDecoder().decode(request.body.body))
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}")))
        }),
        "openai"
      )
      const allowed = {
        model: "gpt-6-luna",
        input: JSON.stringify({ source: "日本語🦊" }),
        questions: [{ type: "predicate", name: "q0", instructions: "Check" }]
      }
      yield* transport.execute(
        HttpClientRequest.post("https://offline.invalid").pipe(
          HttpClientRequest.bodyText(
            JSON.stringify({ ...allowed, state: "PRIVATE", prompt: "PRIVATE", transcript: "PRIVATE" }),
            "application/json"
          )
        )
      )
      expect(sent).toEqual([JSON.stringify(allowed)])
      expect(reviewRequestContent(bytes({ state: "PRIVATE", model: "gpt-6-luna" }), "openai")).toBe(
        '{"model":"gpt-6-luna","input":null,"questions":null}'
      )
      for (const value of [null, false, 0, "", 'quote"\\\n🦊', [], {}]) {
        const fields = { model: value, input: value, questions: value }
        expect(reviewRequestContent(bytes({ ...fields, state: "PRIVATE" }), "openai")).toBe(JSON.stringify(fields))
      }
      expect(reviewRequestContent(bytes({ ...allowed, state: "approved state" }))).toBe(
        JSON.stringify({ model: allowed.model, state: "approved state", questions: allowed.questions })
      )
    })
  )
})
